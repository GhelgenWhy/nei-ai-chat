import React, { useState, useRef, useEffect, FC } from 'react';

export interface AudioRecorderProps {
    onAudioCaptured: (audioDataUrl: string, durationSeconds: number) => void;
    onCancel: () => void;
}

export const AudioRecorder: FC<AudioRecorderProps> = ({ onAudioCaptured, onCancel }) => {
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [seconds, setSeconds] = useState<number>(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const cleanup = () => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
            streamRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, []);

    const startRecording = async (): Promise<void> => {
        setErrorMsg(null);
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        onAudioCaptured(reader.result, seconds);
                    }
                };
                reader.readAsDataURL(blob);
                
                // Stop audio tracks
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
                    streamRef.current = null;
                }
            };

            recorder.start();
            setIsRecording(true);
            setSeconds(0);

            timerRef.current = window.setInterval(() => {
                setSeconds((prev: number) => prev + 1);
            }, 1000);
        } catch (err: unknown) {
            console.error('[AudioRecorder] Access denied or failed:', err);
            setErrorMsg('Microphone permission denied or audio recording not available.');
            cleanup();
        }
    };

    const stopRecording = (): void => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    useEffect(() => {
        void startRecording();
        return () => {
            cleanup();
        };
    }, []);

    const formatTime = (totalSec: number): string => {
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 8px',
            background: 'var(--background-secondary-alt)',
            borderRadius: '6px',
            border: '1px solid var(--background-modifier-border)',
            fontSize: '12px'
        }}>
            {errorMsg ? (
                <div style={{ color: 'var(--text-error, #ff5555)', fontSize: '11px' }}>
                    ⚠️ {errorMsg}
                    <button 
                        onClick={() => { cleanup(); onCancel(); }}
                        style={{ marginLeft: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                        ✕
                    </button>
                </div>
            ) : (
                <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-error, #ff5555)', fontWeight: 'bold' }}>
                        🔴 {formatTime(seconds)}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {isRecording ? 'Recording audio...' : 'Processing audio...'}
                    </span>
                    
                    <button
                        onClick={stopRecording}
                        style={{
                            background: 'var(--interactive-accent)',
                            color: 'var(--text-on-accent)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 'bold'
                        }}
                    >
                        Done
                    </button>

                    <button
                        onClick={() => { cleanup(); onCancel(); }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '11px'
                        }}
                    >
                        Cancel
                    </button>
                </>
            )}
        </div>
    );
};
