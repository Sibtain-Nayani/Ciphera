import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/entity.dart';
import '../models/token.dart';
import '../providers/auth_provider.dart';
import '../services/redaction_service.dart';
import '../utils/entity_colors.dart';
import '../utils/token_builder.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

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
  bool _previewMode = false; // false = show original + highlights, true = show masked
  String? _errorMessage;

  void _onTextChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () => _runAnalysis(text));
  }

  Future<void> _runAnalysis(String text) async {
    if (text.trim().isEmpty) {
      setState(() {
        _entities = [];
        _errorMessage = null;
      });
      return;
    }
    setState(() => _loading = true);
    try {
      final entities = await RedactionService.analyze(text);
      if (!mounted) return;
      setState(() {
        _entities = entities;
        _errorMessage = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.toString();
        _loading = false;
      });
    }
  }

  String _currentDisplayText() {
    final tokens = buildTokenStream(_textController.text, _entities);
    final buffer = StringBuffer();
    for (final t in tokens) {
      if (t.isEntity && _previewMode) {
        buffer.write(maskedReplacement(t.type, t.value));
      } else {
        buffer.write(t.value);
      }
    }
    return buffer.toString();
  }

  Future<void> _onCopyPressed() async {
    final text = _currentDisplayText();
    if (text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nothing to copy yet')),
      );
      return;
    }
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_previewMode ? 'Redacted text copied' : 'Text copied')),
    );
  }

  Future<void> _onExportPressed(bool isGuest) async {
    if (isGuest) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign up to export redacted documents')),
      );
      return;
    }
    final text = _currentDisplayText();
    if (text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nothing to export yet')),
      );
      return;
    }

    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null
        ? box.localToGlobal(Offset.zero) & box.size
        : const Rect.fromLTWH(0, 0, 100, 100);

    await Share.share(
      text,
      subject: 'Ciphera redacted document',
      sharePositionOrigin: origin,
    );
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final tokens = buildTokenStream(_textController.text, _entities);
    final entityCount = tokens.where((t) => t.isEntity).length;

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
                  const Text('Preview redacted', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Switch(
                    value: _previewMode,
                    activeColor: const Color(0xFFF5C400),
                    onChanged: (v) => setState(() => _previewMode = v),
                  ),
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
                    child: SelectableText.rich(
                      TextSpan(children: _buildSpans(tokens)),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _onCopyPressed,
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: Colors.white.withOpacity(0.2)),
                      ),
                      child: const Text('Copy', style: TextStyle(color: Colors.white)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _onExportPressed(auth.isGuest),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(
                          color: auth.isGuest ? Colors.white.withOpacity(0.1) : Colors.white.withOpacity(0.3),
                        ),
                      ),
                      child: Text(
                        'Export',
                        style: TextStyle(color: auth.isGuest ? Colors.white.withOpacity(0.4) : Colors.white),
                      ),
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

  List<TextSpan> _buildSpans(List<RedactToken> tokens) {
    return tokens.map((t) {
      if (!t.isEntity) {
        return TextSpan(text: t.value, style: const TextStyle(color: Colors.white, fontSize: 13));
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
      );
    }).toList();
  }
}