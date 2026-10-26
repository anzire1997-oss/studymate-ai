import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  base64Pdf: string;
  onText: (text: string) => void;
  onError: (error: Error) => void;
}

export default function PdfTextExtractor({ base64Pdf, onText, onError }: Props) {
  const wvRef = useRef<WebView>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    const t = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onError(new Error("PDF extraction timed out after 15s")); }
    }, 15000);
    return () => clearTimeout(t);
  }, [base64Pdf]);

  const html = useMemo(() => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function onMsg(e) {
  try {
    var raw = atob(e.data), bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
      var txt = '', ps = [];
      for (var p = 1; p <= pdf.numPages; p++) ps.push(pdf.getPage(p).then(function(page) {
        return page.getTextContent().then(function(c) { txt += c.items.map(function(i) { return i.str; }).join(' ') + '\\n'; });
      }));
      Promise.all(ps).then(function() { window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, text: txt })); });
    });
  } catch(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: e.message })); }
}
window.addEventListener('message', onMsg);
document.addEventListener('message', onMsg);
</script>
</head><body></body></html>`, []);

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <WebView
        ref={wvRef}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        source={{ html }}
        onLoad={() => wvRef.current?.postMessage(base64Pdf)}
        onMessage={(e) => {
          if (doneRef.current) return;
          doneRef.current = true;
          const d = JSON.parse(e.nativeEvent.data);
          d.ok ? onText(d.text) : onError(new Error(d.error || 'Extraction failed'));
        }}
        onError={(e) => {
          if (doneRef.current) return;
          doneRef.current = true;
          onError(new Error(e.nativeEvent.description));
        }}
      />
    </View>
  );
}
