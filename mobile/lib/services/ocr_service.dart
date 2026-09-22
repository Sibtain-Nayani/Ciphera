import 'dart:io';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

class OcrService {
  static Future<String> extractText(String imagePath) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final inputImage = InputImage.fromFile(File(imagePath));
      final result = await recognizer.processImage(inputImage);
      return result.text;
    } finally {
      await recognizer.close();
    }
  }
}