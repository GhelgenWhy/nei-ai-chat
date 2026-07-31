import * as React from 'react';

export interface AudioRecorderProps {
    onAudioCaptured: (audioDataUrl: string, durationSeconds: number) => void;
    onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioCaptured, onCancel }) => {
    const [isRecording, setIsRecording] = React.useState(false);
    const [seconds, setSeconds] = React.useState(0);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const audioChunksRef = React.useRef<Blob[]>([]);
    const timerRef = React.useRef<number | null>(null);

    const startRecording = async () => {
        setErrorMsg(null);
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setIsRecording(true);
            setSeconds(0);

            timerRef.current = window.setInterval(() => {
                setSeconds(prev => prev + 1);
            }, 1000);
        } catch (err: unknown) {
            console.error('[AudioRecorder] Access denied or failed:', err);
            setErrorMsg('Microphone permission denied or audio recording not available.');
        }
    };

    const stopRecording = () => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    React.useEffect(() => {
        void startRecording();
        return () => {
            if (timerRef.current !== null) {
                window.clearInterval(timerRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const formatTime = (totalSec: number) => {
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
                        onClick={onCancel}
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
                        onClick={onCancel}
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
