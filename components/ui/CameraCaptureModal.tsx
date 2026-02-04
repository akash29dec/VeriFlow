'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Check, AlertCircle } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start camera stream (only gets stream)
  const startCamera = useCallback(async () => {
    try {
      setIsCameraReady(false);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }, 
        audio: false,
      });
      setStream(mediaStream);
      streamRef.current = mediaStream;
      setError(null);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Failed to access camera. Please deny permission and try again, or upload a file.');
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setIsCameraReady(false);
    }
  }, []);

  // Handle stream binding to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      
      const handleCanPlay = () => {
        setIsCameraReady(true);
        video.play().catch(console.error);
      };

      video.onloadedmetadata = () => {
        video.play().catch(console.error);
      };
      
      video.oncanplay = handleCanPlay;

      return () => {
        video.oncanplay = null;
        video.onloadedmetadata = null;
      };
    }
  }, [stream]);

  // Initial stream setup (open/close modal)
  useEffect(() => {
    if (isOpen && !imageSrc) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, imageSrc, startCamera, stopCamera]);

  // Capture photo
  const handleCapture = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      setIsCapturing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      

      
      // Safety check: ensure video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error("Video dimensions not ready");
        setIsCapturing(false);
        return;
      }
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to data URL for preview
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setImageSrc(dataUrl);
        stopCamera(); // Stop stream to save battery
      }
      setIsCapturing(false);
    }
  }, [stopCamera]);

  // Retake photo
  const handleRetake = () => {
    setImageSrc(null);
    startCamera();
  };

  // Confirm photo
  const handleConfirm = useCallback(async () => {
    if (!imageSrc) return;

    // Convert data URL to File
    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    } catch (err) {
      setError('Failed to process image');
      console.error(err);
    }
  }, [imageSrc, onCapture, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50 absolute top-0 left-0 right-0 z-10 backdrop-blur-sm">
        <span className="text-white font-medium">Take Photo</span>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content (Video or Preview) */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black">
        {error ? (
          <div className="text-center p-6 max-w-xs">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-white mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white text-black font-medium rounded-lg"
            >
              Close
            </button>
          </div>
        ) : imageSrc ? (
          // Preview Mode
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt="Preview"
            className="w-full h-full object-contain"
          />
        ) : (
          // Live Video Mode
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-8 bg-black/50 absolute bottom-0 left-0 right-0 backdrop-blur-sm pb-10">
        <div className="flex items-center justify-center gap-8">
          {imageSrc ? (
            // Review Controls
            <>
              <button
                onClick={handleRetake}
                className="flex flex-col items-center gap-2 text-white opacity-80 hover:opacity-100"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <span className="text-xs">Retake</span>
              </button>

              <button
                onClick={handleConfirm}
                className="flex flex-col items-center gap-2 text-white"
              >
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
                  <Check className="w-8 h-8" />
                </div>
                <span className="text-xs font-bold">Confirm</span>
              </button>
            </>
          ) : (
            // Capture Controls
            !error && (
              <button
                onClick={handleCapture}
                disabled={isCapturing || !isCameraReady}
                className={`w-20 h-20 rounded-full border-4 flex items-center justify-center relative group transition-all ${
                  isCameraReady ? 'border-white cursor-pointer' : 'border-gray-500 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className={`w-16 h-16 rounded-full transition-transform ${
                  isCameraReady ? 'bg-white group-active:scale-90' : 'bg-gray-500' 
                }`} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Hidden Canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
