'use client';
import { useEffect, useRef, useState } from 'react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onError?: (err: string) => void;
  active: boolean;
}

export default function BarcodeScanner({ onScan, onError, active }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | null = null;

    async function startScanner() {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (stopped) return;

      const reader = new BrowserMultiFormatReader();

      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices.length === 0) {
          setCameraError('Aucune caméra détectée');
          onError?.('no-camera');
          return;
        }
        const rearCamera = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        if (!videoRef.current || stopped) return;

        await reader.decodeFromVideoDevice(
          rearCamera.deviceId,
          videoRef.current,
          (result, err) => {
            if (stopped) return;
            if (result) onScan(result.getText());
            if (err && err.name !== 'NotFoundException') console.warn('Scanner:', err);
          }
        );
      } catch (err: any) {
        if (stopped) return;
        const msg = err?.message || 'Erreur caméra';
        setCameraError(msg);
        onError?.(msg);
      }
    }

    startScanner();

    return () => {
      stopped = true;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [active, onScan, onError]);

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-900 rounded-2xl text-white text-center p-6">
        <p className="text-4xl mb-3">📷</p>
        <p className="text-sm text-gray-300">{cameraError}</p>
        <p className="text-xs text-gray-500 mt-2">Vérifiez les permissions caméra dans les paramètres du navigateur.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '1' }}>
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-56 h-56 relative">
          <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-400 rounded-tl-lg" />
          <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-400 rounded-tr-lg" />
          <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-400 rounded-bl-lg" />
          <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-400 rounded-br-lg" />
          <div className="absolute inset-x-0 top-0 h-0.5 bg-yellow-400 opacity-80 scanline-anim" />
        </div>
      </div>
    </div>
  );
}
