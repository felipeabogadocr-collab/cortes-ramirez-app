import { useEffect, useState } from "react";

export default function Toast() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let timer;
    function onDownload(e) {
      setMessage(`Descarga completa: ${e.detail.filename}`);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 3500);
    }
    window.addEventListener("folio:download", onDownload);
    return () => {
      window.removeEventListener("folio:download", onDownload);
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="toast" role="status">
      <span>✅</span>
      <span>{message}</span>
    </div>
  );
}
