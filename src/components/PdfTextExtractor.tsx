import { useMemo } from "react";
import { WebView } from "react-native-webview";

interface Props {
  base64Pdf: string;
  onText: (text: string) => void;
  onError: (error: Error) => void;
}

export default function PdfTextExtractor({ base64Pdf, onText, onError }: Props) {
  const html = useMemo(() => {
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
</script>
</head>
<body>
<script>
(async function() {
  try {
    const raw = atob('${base64Pdf}');
    const len = raw.length;
    const bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    var fullText = '';
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      fullText += content.items.map(function(item) { return item.str; }).join(' ') + '\\n';
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, text: fullText }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: e.message }));
  }
})();
</script>
</body></html>`;
  }, [base64Pdf]);

  return (
    <WebView
      style={{ width: 0, height: 0, opacity: 0 }}
      originWhitelist={['*']}
      javaScriptEnabled={true}
      source={{ html }}
      onMessage={(e) => {
        const data = JSON.parse(e.nativeEvent.data);
        if (data.ok) {
          onText(data.text);
        } else {
          onError(new Error(data.error || 'Extraction failed'));
        }
      }}
      onError={(e) => onError(new Error(e.nativeEvent.description))}
    />
  );
}
