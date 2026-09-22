import 'dart:async';
import 'dart:io';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import '../models/entity.dart';
import '../models/token.dart';
import '../providers/auth_provider.dart';
import '../providers/rules_provider.dart';
import '../services/redaction_service.dart';
import '../services/ocr_service.dart';
import '../services/language_service.dart';
import '../services/local_stats_service.dart';
import '../utils/entity_colors.dart';
import '../utils/token_builder.dart';

class RedactScreen extends StatefulWidget {
  const RedactScreen({super.key});

  @override
  State<RedactScreen> createState() => _RedactScreenState();
}

class _RedactScreenState extends State<RedactScreen> {
  final _textController = TextEditingController();
  Timer? _debounce;
  List<DetectedEntity> _entities = [];
  bool _loading = false;
  bool _previewMode = false;
  String? _errorMessage;
  final Set<String> _rejectedKeys = {};
  final List<TapGestureRecognizer> _recognizers = [];
  LanguageMode _detectedLanguage = LanguageMode.english;

  String _keyFor(RedactToken t) => '${t.start}-${t.end}-${t.type}';

  void _onTextChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () => _runAnalysis(text));
  }

  Future<void> _onUploadPressed() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['txt', 'md', 'csv', 'json'],
    );
    if (result == null || result.files.single.path == null) return;

    try {
      final file = File(result.files.single.path!);
      final content = await file.readAsString();
      _textController.text = content;
      _onTextChanged(content);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Loaded ${result.files.single.name}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not read file: $e')),
      );
    }
  }

  Future<void> _onImagePressed() async {
    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: const Color(0xFF121212),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt, color: Colors.white),
              title: const Text('Take photo', style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library, color: Colors.white),
              title: const Text('Choose from library', style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    final picked = await picker.pickImage(source: source, imageQuality: 90);
    if (picked == null) return;

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reading text from image…')));

    try {
      final text = await OcrService.extractText(picked.path);
      if (text.trim().isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No text found in image')));
        return;
      }
      _textController.text = text;
      _onTextChanged(text);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('OCR failed: $e')));
    }
  }

  Future<void> _runAnalysis(String text) async {
    if (text.trim().isEmpty) {
      setState(() {
        _entities = [];
        _errorMessage = null;
        _rejectedKeys.clear();
      });
      return;
    }
    setState(() => _loading = true);
    final threshold = context.read<RulesProvider>().threshold;
    try {
      final mode = await LanguageService.detect(text);
      final entities = await RedactionService.analyze(text, threshold: threshold, languageMode: mode);
      if (!mounted) return;
      setState(() {
        _entities = entities;
        _detectedLanguage = mode;
        _errorMessage = null;
        _loading = false;
      });
      if (entities.isNotEmpty) {
        LocalStatsService.recordSession(entities.length);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.toString();
        _loading = false;
      });
    }
  }

  List<DetectedEntity> _visibleEntities(RulesProvider rulesProvider) {
    return _entities.where((e) => rulesProvider.isEnabled(e.entityType)).toList();
  }

  String _currentDisplayText(RulesProvider rulesProvider) {
    final tokens = buildTokenStream(_textController.text, _visibleEntities(rulesProvider));
    final buffer = StringBuffer();
    for (final t in tokens) {
      final rejected = t.isEntity && _rejectedKeys.contains(_keyFor(t));
      if (t.isEntity && _previewMode && !rejected) {
        buffer.write(maskedReplacement(t.type, t.value));
      } else {
        buffer.write(t.value);
      }
    }
    return buffer.toString();
  }

  Future<void> _onCopyPressed(RulesProvider rulesProvider) async {
    final text = _currentDisplayText(rulesProvider);
    if (text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nothing to copy yet')));
      return;
    }
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_previewMode ? 'Redacted text copied' : 'Text copied')),
    );
  }

  Future<void> _onExportPressed(bool isGuest, RulesProvider rulesProvider) async {
    if (isGuest) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Sign up to export redacted documents')));
      return;
    }
    final text = _currentDisplayText(rulesProvider);
    if (text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nothing to export yet')));
      return;
    }
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : const Rect.fromLTWH(0, 0, 100, 100);
    await Share.share(text, subject: 'Ciphera redacted document', sharePositionOrigin: origin);
  }

  void _openEntityModal(RedactToken t) {
    final key = _keyFor(t);
    final isRejected = _rejectedKeys.contains(key);
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF121212),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.type.toUpperCase(),
                  style: const TextStyle(color: Color(0xFFF5C400), fontSize: 12, letterSpacing: 1)),
              const SizedBox(height: 8),
              Text(t.value, style: const TextStyle(color: Colors.white, fontSize: 16)),
              if (t.score != null) ...[
                const SizedBox(height: 4),
                Text('Confidence: ${(t.score! * 100).toStringAsFixed(0)}%',
                    style: const TextStyle(color: Colors.white54, fontSize: 12)),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isRejected ? const Color(0xFFF5C400) : Colors.white.withOpacity(0.08),
                  ),
                  onPressed: () {
                    setState(() {
                      if (isRejected) {
                        _rejectedKeys.remove(key);
                      } else {
                        _rejectedKeys.add(key);
                      }
                    });
                    Navigator.pop(ctx);
                  },
                  child: Text(
                    isRejected ? 'Re-approve as PII' : 'Reject — treat as normal text',
                    style: TextStyle(color: isRejected ? Colors.black : Colors.white),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _disposeRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  List<TextSpan> _buildSpans(List<RedactToken> tokens) {
    _disposeRecognizers();
    return tokens.map((t) {
      if (!t.isEntity) {
        return TextSpan(text: t.value, style: const TextStyle(color: Colors.white, fontSize: 13));
      }
      final isRejected = _rejectedKeys.contains(_keyFor(t));
      final recognizer = TapGestureRecognizer()..onTap = () => _openEntityModal(t);
      _recognizers.add(recognizer);

      if (isRejected) {
        return TextSpan(
          text: t.value,
          style: const TextStyle(color: Colors.white54, fontSize: 13),
          recognizer: recognizer,
        );
      }

      final color = colorForEntityType(t.type);
      final display = _previewMode ? maskedReplacement(t.type, t.value) : t.value;
      return TextSpan(
        text: display,
        style: TextStyle(
          color: color,
          backgroundColor: color.withOpacity(0.18),
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
        recognizer: recognizer,
      );
    }).toList();
  }

  @override
  void dispose() {
    _disposeRecognizers();
    _debounce?.cancel();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final rulesProvider = context.watch<RulesProvider>();
    final visibleEntities = _visibleEntities(rulesProvider);
    final tokens = buildTokenStream(_textController.text, visibleEntities);
    final entityCount =
        tokens.where((t) => t.isEntity && !_rejectedKeys.contains(_keyFor(t))).length;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('REDACT',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
                  Row(
                    children: [
                      if (_loading)
                        const Padding(
                          padding: EdgeInsets.only(right: 8),
                          child: SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF4ade80).withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text('$entityCount entities',
                            style: const TextStyle(color: Color(0xFF4ade80), fontSize: 11)),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.06),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          switch (_detectedLanguage) {
                            LanguageMode.hindi => 'हिंदी',
                            LanguageMode.mixed => 'MIXED',
                            LanguageMode.english => 'EN',
                          },
                          style: const TextStyle(color: Colors.white54, fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              if (auth.isGuest)
                Container(
                  margin: const EdgeInsets.only(top: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5C400).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text('Guest session · sign up to export',
                      style: TextStyle(color: Color(0xFFF5C400), fontSize: 11)),
                ),
              const SizedBox(height: 12),
              TextField(
                controller: _textController,
                onChanged: _onTextChanged,
                maxLines: 6,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: InputDecoration(
                  hintText: 'Paste or type text to detect PII…',
                  hintStyle: const TextStyle(color: Colors.white38),
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.03),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.white.withOpacity(0.07)),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  IconButton(
                    onPressed: _onUploadPressed,
                    icon: const Icon(Icons.upload_file, color: Color(0xFFF5C400), size: 20),
                    tooltip: 'Upload text file',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 12),
                  IconButton(
                    onPressed: _onImagePressed,
                    icon: const Icon(Icons.camera_alt_outlined, color: Color(0xFFF5C400), size: 20),
                    tooltip: 'Scan image',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 12),
                  const Text('Preview redacted', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Switch(
                    value: _previewMode,
                    activeColor: const Color(0xFFF5C400),
                    onChanged: (v) => setState(() => _previewMode = v),
                  ),
                  const Spacer(),
                  const Text('Tap highlight', style: TextStyle(color: Colors.white38, fontSize: 11)),
                ],
              ),
              if (_errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_errorMessage!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 12)),
                ),
              Expanded(
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.03),
                    border: Border.all(color: Colors.white.withOpacity(0.07)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: SingleChildScrollView(
                    child: SelectableText.rich(TextSpan(children: _buildSpans(tokens))),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _onCopyPressed(rulesProvider),
                      style: OutlinedButton.styleFrom(side: BorderSide(color: Colors.white.withOpacity(0.2))),
                      child: const Text('Copy', style: TextStyle(color: Colors.white)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _onExportPressed(auth.isGuest, rulesProvider),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(
                          color: auth.isGuest ? Colors.white.withOpacity(0.1) : Colors.white.withOpacity(0.3),
                        ),
                      ),
                      child: Text('Export',
                          style: TextStyle(color: auth.isGuest ? Colors.white.withOpacity(0.4) : Colors.white)),
                    ),
                  ),
                ],
              ),
              TextButton(
                onPressed: () => auth.logout(),
                child: const Text('Logout', style: TextStyle(color: Colors.white38)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}