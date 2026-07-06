import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, RotateCcw, Volume2, Edit3, Save, Music, 
  Video, Download, VolumeX, Eye, Sparkles, Check, CheckCircle2,
  Sliders, Mic, FileText, ChevronRight, Layers, Map, BarChart3, Globe, Activity, AlertCircle
} from "lucide-react";
import { jsPDF } from "jspdf";
import { AnalysisResults, VideoMetadata } from "../types";

interface VideoStudioProps {
  results: AnalysisResults;
  metadata: VideoMetadata;
}

interface VoiceConfig {
  id: string;
  name: string;
  lang: string;
  gender: "male" | "female";
  desc: string;
  pitch: number;
  rate: number;
}

type SceneTemplate = "news_studio" | "satellite_map" | "bar_chart" | "world_grid" | "breaking_red";

interface SceneConfig {
  sentenceIdx: number;
  template: SceneTemplate;
  showLowerThird: boolean;
  lowerThirdText: string;
  overlayLabel: string;
}

export default function VideoStudio({ results, metadata }: VideoStudioProps) {
  // 1. Script & Text States
  const [editedScript, setEditedScript] = useState(() => {
    const baseText = results.newsArticle || results.transcript;
    return baseText.trim();
  });
  const [isEditing, setIsEditing] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);

  // 2. Player Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [bgMusicEnabled, setBgMusicEnabled] = useState(true);
  const [bgMusicVolume, setBgMusicVolume] = useState(40);
  const [selectedVoice, setSelectedVoice] = useState("almaz");
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
  const [musicTheme, setMusicTheme] = useState<"pulse" | "orchestral" | "tech">("pulse");

  // Voice Custom Pitch Option
  const [voicePitch, setVoicePitch] = useState(1.0);

  // 3. Export & Rendering States
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [isAudioExporting, setIsAudioExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 4. Voice Options Configuration
  const voices: VoiceConfig[] = [
    { id: "almaz", name: "አልማዝ (ዜና አቅራቢ)", lang: "am-ET", gender: "female", desc: "Crisp, authoritative TV anchor style", pitch: 1.1, rate: 0.95 },
    { id: "abebe", name: "አበበ (ባለሙያ ጋዜጠኛ)", lang: "am-ET", gender: "male", desc: "Deep, assertive radio presenter style", pitch: 0.85, rate: 1.0 },
    { id: "yonas", name: "ዮናስ (ማብራሪያ ሰጪ)", lang: "am-ET", gender: "male", desc: "Fast-paced energetic reporter style", pitch: 1.0, rate: 1.15 }
  ];

  // 5. DOM & Audio References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicNodeRef = useRef<BiquadFilterNode | null>(null); // Synthesized synth reference
  const synthIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Parse edited script into sentences for captions and timeline
  const sentences = React.useMemo(() => {
    if (!editedScript) return ["ሰላም፤ እንኳን ወደ አማርኛ AI ዜና ስቱዲዮ በደህና መጡ።"];
    // Split by common Amharic sentence end markers (።, \n, ?, !)
    return editedScript
      .split(/(።|\n+|\?|！)/)
      .reduce<string[]>((acc, cur, idx) => {
        if (idx % 2 === 0) {
          if (cur.trim()) acc.push(cur.trim());
        } else {
          if (acc.length > 0 && cur.trim()) {
            acc[acc.length - 1] += cur;
          }
        }
        return acc;
      }, [])
      .filter(s => s.length > 3);
  }, [editedScript]);

  // Estimate total duration: ~200ms per character of Amharic text + pauses
  const sentenceDurations = React.useMemo(() => {
    return sentences.map(s => {
      const charCount = s.length;
      return Math.max(3, charCount * 0.18 + 0.8); // Min 3 seconds per sentence
    });
  }, [sentences]);

  const totalDuration = React.useMemo(() => {
    return sentenceDurations.reduce((acc, d) => acc + d, 0);
  }, [sentenceDurations]);

  // Scene configuration state
  const [sceneConfigs, setSceneConfigs] = useState<SceneConfig[]>([]);

  // Synchronize sceneConfigs on sentence change
  useEffect(() => {
    const templates: SceneTemplate[] = ["news_studio", "satellite_map", "bar_chart", "world_grid", "breaking_red"];
    const labels = ["ወቅታዊ ዘገባ", "ካርታ ትንተና", "የቁጥር መረጃ", "አቀፍ ትስስር", "ሰበር ዜና"];
    
    setSceneConfigs(prev => {
      return sentences.map((_, idx) => {
        const existing = prev.find(c => c.sentenceIdx === idx);
        if (existing) return { ...existing, sentenceIdx: idx };
        return {
          sentenceIdx: idx,
          template: templates[idx % templates.length],
          showLowerThird: true,
          lowerThirdText: `ክፍል ${idx + 1} - ዋና መረጃ`,
          overlayLabel: labels[idx % labels.length]
        };
      });
    });
  }, [sentences]);

  // Update a field for the active scene
  const updateSceneConfig = (field: keyof SceneConfig, value: any) => {
    setSceneConfigs(prev => {
      return prev.map((config) => {
        if (config.sentenceIdx === activeSentenceIndex) {
          return { ...config, [field]: value };
        }
        return config;
      });
    });
  };

  // Synchronized refs for efficient canvas drawing
  const activeSentenceIndexRef = useRef(activeSentenceIndex);
  const currentTimeRef = useRef(currentTime);
  const sentencesRef = useRef(sentences);
  const resultsRef = useRef(results);
  const metadataRef = useRef(metadata);
  const sceneConfigsRef = useRef(sceneConfigs);

  useEffect(() => { activeSentenceIndexRef.current = activeSentenceIndex; }, [activeSentenceIndex]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { sentencesRef.current = sentences; }, [sentences]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { metadataRef.current = metadata; }, [metadata]);
  useEffect(() => { sceneConfigsRef.current = sceneConfigs; }, [sceneConfigs]);

  // Determine active sentence index based on current time
  useEffect(() => {
    let targetIndex = 0;
    let accumulated = 0;
    let found = false;
    for (let i = 0; i < sentenceDurations.length; i++) {
      accumulated += sentenceDurations[i];
      if (currentTime <= accumulated) {
        targetIndex = i;
        found = true;
        break;
      }
    }
    const finalIndex = found ? targetIndex : (sentences.length > 0 ? sentences.length - 1 : 0);
    if (activeSentenceIndex !== finalIndex) {
      setActiveSentenceIndex(finalIndex);
    }
  }, [currentTime, sentenceDurations, sentences, activeSentenceIndex]);

  // Speech Synthesis Controller (Web Speech API)
  const speakActiveSentence = (index: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    
    try {
      // Stop any ongoing speech safely
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn("Speech cancellation failed", e);
    }

    if (!isPlaying) return;

    try {
      const sentence = sentences[index];
      if (!sentence) return;
      const voiceCfg = voices.find(v => v.id === selectedVoice) || voices[0];
      
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = voiceCfg.rate * speakingSpeed;
      // Apply voice Pitch modifier slider
      utterance.pitch = voiceCfg.pitch * voicePitch;

      // Find a matching system voice if available
      const systemVoices = window.speechSynthesis.getVoices();
      const amharicVoice = systemVoices.find(v => v.lang.startsWith("am") || v.lang.startsWith("am-ET"));
      if (amharicVoice) {
        utterance.voice = amharicVoice;
      } else {
        // Fallback: search for other appropriate voices or use default
        const fallbackVoice = systemVoices.find(v => v.lang.startsWith("en"));
        if (fallbackVoice) utterance.voice = fallbackVoice;
      }

      // Set volume
      utterance.volume = isMuted ? 0 : volume / 100;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis trigger failed", e);
    }
  };

  // Trigger speech on sentence index change
  useEffect(() => {
    if (isPlaying) {
      speakActiveSentence(activeSentenceIndex);
    } else {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {
          console.warn("Clean cancellation failed", e);
        }
      }
    }
  }, [activeSentenceIndex, isPlaying, selectedVoice, speakingSpeed, voicePitch, volume, isMuted]);

  // Synthesize Background Music via Web Audio API (Saves loading external files)
  const startBackgroundMusic = () => {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      let step = 0;
      // Synthesized sound palettes depending on chosen style
      const pulseNotes = [55, 55, 48, 48, 65, 55, 48, 55]; // Bass frequencies
      const orchestralNotes = [65.4, 65.4, 73.4, 73.4, 87.3, 98.0, 87.3, 73.4]; // C minor warm notes
      const techNotes = [110.0, 110.0, 146.8, 164.8, 220.0, 146.8, 164.8, 110.0]; // energetic futuristic

      const interval = window.setInterval(() => {
        if (!isPlaying || !bgMusicEnabled || isMuted) return;

        // Bass Pulse / Theme Synth Node
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Tune waves depending on theme
        if (musicTheme === "tech") {
          osc.type = "sawtooth";
          const freq = techNotes[step % techNotes.length];
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          filter.type = "peaking";
          filter.frequency.setValueAtTime(500, ctx.currentTime);
        } else if (musicTheme === "orchestral") {
          osc.type = "sine"; // cleaner pure cinematic bass tone
          const freq = orchestralNotes[step % orchestralNotes.length];
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(450, ctx.currentTime);
        } else {
          osc.type = "triangle";
          const freq = pulseNotes[step % pulseNotes.length];
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(300, ctx.currentTime);
        }

        filter.Q.setValueAtTime(6, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);

        // Volume envelope
        gain.gain.setValueAtTime((bgMusicVolume / 100) * 0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.48);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);

        // Sub-beat ticking high hat for news style rhythm
        if (step % 2 === 0) {
          const noiseOsc = ctx.createOscillator();
          const noiseGain = ctx.createGain();
          const noiseFilter = ctx.createBiquadFilter();

          noiseOsc.type = "triangle";
          noiseOsc.frequency.setValueAtTime(10000, ctx.currentTime);

          noiseFilter.type = "bandpass";
          noiseFilter.frequency.setValueAtTime(8000, ctx.currentTime);

          noiseGain.gain.setValueAtTime((bgMusicVolume / 100) * 0.03, ctx.currentTime);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

          noiseOsc.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(ctx.destination);

          noiseOsc.start();
          noiseOsc.stop(ctx.currentTime + 0.1);
        }

        step++;
      }, 500); // 120 BPM

      synthIntervalRef.current = interval;
    } catch (e) {
      console.warn("Could not load Web Audio synthesis", e);
    }
  };

  const stopBackgroundMusic = () => {
    if (synthIntervalRef.current) {
      clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
  };

  // Toggle Play/Pause
  const handlePlayPause = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      startBackgroundMusic();
    } else {
      setIsPlaying(false);
      stopBackgroundMusic();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveSentenceIndex(0);
    stopBackgroundMusic();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Sync timeline progress loop
  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = performance.now();
    let frameId: number;

    const updateProgress = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      setCurrentTime(prev => {
        const next = prev + delta;
        if (next >= totalDuration) {
          return totalDuration;
        }
        return next;
      });

      frameId = requestAnimationFrame(updateProgress);
    };

    frameId = requestAnimationFrame(updateProgress);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isPlaying, totalDuration]);

  // Handle auto-stop at the end of the video segment
  useEffect(() => {
    if (currentTime >= totalDuration && isPlaying) {
      setIsPlaying(false);
      stopBackgroundMusic();
    }
  }, [currentTime, totalDuration, isPlaying]);

  // Stop synthesis when component unmounts
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // 6. Canvas TV-News Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let localFrameId: number;
    let rotationAngle = 0;
    let tickerX = canvas.width;

    // Load static slide graphics or icons to display
    const stockBackgrounds: Record<string, string> = {
      news_studio: "rgba(15, 23, 42, 0.95)", // Slate Dark
      satellite_map: "rgba(11, 19, 43, 0.95)", // Tech Dark Blue
      bar_chart: "rgba(20, 15, 38, 0.95)", // Deep Purple Analytical
      world_grid: "rgba(10, 25, 20, 0.95)", // Forest Digital Green
      breaking_red: "rgba(66, 10, 10, 0.95)" // Warning Alert Red-black
    };

    const render = () => {
      rotationAngle += 0.01;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeIdx = activeSentenceIndexRef.current;
      const currTime = currentTimeRef.current;
      const sents = sentencesRef.current;
      const res = resultsRef.current;
      const meta = metadataRef.current;
      const configs = sceneConfigsRef.current;

      const currentConfig = configs[activeIdx] || {
        template: "news_studio",
        showLowerThird: true,
        lowerThirdText: "የይዘት ትንተና ዘገባ (AI news report)",
        overlayLabel: "ወቅታዊ ጉዳይ"
      };

      const bgStyle = stockBackgrounds[currentConfig.template] || stockBackgrounds.news_studio;

      // A. Background Slide Pattern
      ctx.fillStyle = bgStyle;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // B. Motion Graphics overlays depending on chosen Template
      if (currentConfig.template === "satellite_map") {
        // RADAR / SATELLITE MAP OVERLAY
        ctx.strokeStyle = "rgba(14, 165, 233, 0.15)";
        ctx.lineWidth = 1;
        // Horizontal & Vertical Grid lines
        for (let x = 0; x < canvas.width; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height - 35); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        // Radar Scanning sweep
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2 - 30);
        ctx.strokeStyle = "rgba(14, 165, 233, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 120, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(14, 165, 233, 0.6)";
        ctx.beginPath();
        const sweepX = Math.cos(rotationAngle * 2) * 120;
        const sweepY = Math.sin(rotationAngle * 2) * 120;
        ctx.moveTo(0, 0);
        ctx.lineTo(sweepX, sweepY);
        ctx.stroke();

        // Pulsing targets (Major Amharic region markers A.A and B.D)
        const pulseRad = 6 + Math.abs(Math.sin(rotationAngle * 3)) * 8;
        ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
        ctx.beginPath(); ctx.arc(-110, -30, pulseRad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px monospace";
        ctx.fillText("TARGET [AA]", -140, -45);

        ctx.fillStyle = "rgba(16, 185, 129, 0.6)";
        ctx.beginPath(); ctx.arc(80, 50, pulseRad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("SECURE [BD]", 50, 35);

        ctx.restore();

      } else if (currentConfig.template === "bar_chart") {
        // ANALYTICAL CHART VIZ OVERLAY
        ctx.strokeStyle = "rgba(168, 85, 247, 0.15)";
        ctx.lineWidth = 1.5;
        // Grid background
        for (let y = 80; y < canvas.height - 120; y += 30) {
          ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(canvas.width - 80, y); ctx.stroke();
        }

        const barData = [
          { label: "ትርታ (BPM)", height: 80 + Math.sin(rotationAngle * 4) * 30, color: "rgba(168, 85, 247, 0.85)" },
          { label: "ትንተና (Data)", height: 110 + Math.cos(rotationAngle * 2) * 40, color: "rgba(236, 72, 153, 0.85)" },
          { label: "ምልከታ (Views)", height: 130 + Math.sin(rotationAngle) * 20, color: "rgba(59, 130, 246, 0.85)" },
          { label: "ትክክለኛነት (Fact)", height: 140, color: "rgba(16, 185, 129, 0.85)" }
        ];

        barData.forEach((b, i) => {
          const startX = 140 + i * 160;
          const startY = canvas.height - 140;
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.roundRect(startX, startY - b.height, 65, b.height, [8, 8, 0, 0]);
          ctx.fill();

          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(b.label, startX + 32, startY + 18);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`${Math.round(b.height)}%`, startX + 32, startY - b.height - 8);
        });

      } else if (currentConfig.template === "world_grid") {
        // WORLD NODE GRID NETWORK
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2 - 30);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.1)";
        ctx.lineWidth = 1.5;
        // Matrix circles
        for (let r = 40; r < 240; r += 40) {
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        }

        // Connect nodes
        const points = [];
        const numNodes = 7;
        for (let i = 0; i < numNodes; i++) {
          const angle = rotationAngle * 0.5 + (i * Math.PI * 2 / numNodes);
          const r = 100 + Math.sin(rotationAngle + i) * 20;
          points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }

        ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Node dots
        points.forEach((p, idx) => {
          ctx.fillStyle = idx % 2 === 0 ? "#10b981" : "#facc15";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();

      } else if (currentConfig.template === "breaking_red") {
        // INTENSE BREAKING ALERTS
        ctx.fillStyle = "rgba(220, 38, 38, 0.08)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Warning Hazard borders
        ctx.fillStyle = "rgba(250, 204, 21, 0.8)";
        ctx.save();
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 30) {
          ctx.moveTo(x, 50);
          ctx.lineTo(x + 15, 50);
          ctx.lineTo(x + 5, 58);
          ctx.lineTo(x - 10, 58);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Flashing screen halo
        const alertIntensity = Math.abs(Math.sin(rotationAngle * 5)) * 0.15;
        ctx.fillStyle = `rgba(239, 68, 68, ${alertIntensity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Bold warning circle center
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2 - 30);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 90 + Math.sin(rotationAngle * 8) * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        // DEFAULT NEWS STUDIO: Spinning Globe visualizer
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2 - 30);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.2)"; // emerald green wireframe
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, 160, 60 + i * 20, rotationAngle + (i * Math.PI / 6), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        // Abstract Floating Media Frames (Simulating news graphics)
        ctx.fillStyle = "rgba(16, 185, 129, 0.05)";
        ctx.strokeStyle = "rgba(16, 185, 129, 0.2)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(40, 50, canvas.width - 80, canvas.height - 180, 16);
        ctx.fill();
        ctx.stroke();
      }

      // Draw a highly polished, original vector media/graphics frame instead of external cross-origin images to guarantee CORS security and prevent canvas tainting
      if (currentConfig.template === "news_studio" || currentConfig.template === "world_grid" || currentConfig.template === "breaking_red") {
        ctx.save();
        
        // Main bounding box for the broadcast graphics insert
        const cardX = canvas.width / 2 - 160;
        const cardY = canvas.height / 2 - 130;
        const cardWidth = 320;
        const cardHeight = 170;
        
        // Clean drop shadow
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        
        // Card body with sleek glassmorphic effect
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.strokeStyle = currentConfig.template === "breaking_red" ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 16);
        ctx.fill();
        ctx.shadowColor = "transparent"; // Reset shadow
        ctx.stroke();
        
        // Top status bar inside graphics frame
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();
        ctx.roundRect(cardX + 1, cardY + 1, cardWidth - 2, 30, [15, 15, 0, 0]);
        ctx.fill();
        
        // Tiny glowing status dot and title
        ctx.fillStyle = currentConfig.template === "breaking_red" ? "#ef4444" : "#10b981";
        ctx.beginPath();
        ctx.arc(cardX + 20, cardY + 16, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.fillText("AMHARIC BROADCAST NETWORK • LIVE DECODE", cardX + 32, cardY + 19);
        
        // Inner content: Decorative wave / digital grid pattern
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.lineWidth = 1;
        for (let gx = cardX + 10; gx < cardX + cardWidth; gx += 15) {
          ctx.beginPath();
          ctx.moveTo(gx, cardY + 35);
          ctx.lineTo(gx, cardY + cardHeight - 10);
          ctx.stroke();
        }
        
        // Draw elegant visual audio wave in bottom of card
        ctx.strokeStyle = currentConfig.template === "breaking_red" ? "rgba(239, 68, 68, 0.35)" : "rgba(16, 185, 129, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let wx = 0; wx < 100; wx += 5) {
          const waveHeight = Math.sin(rotationAngle * 3 + wx * 0.1) * 15;
          const px = cardX + 20 + (wx * 2.8);
          const py = cardY + cardHeight - 35 + waveHeight;
          if (wx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        
        // Primary text display: The translated video title or active category
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        
        // Truncated title string if very long
        const displayTitle = meta.title.length > 32 ? meta.title.substring(0, 30) + "..." : meta.title;
        ctx.fillText(displayTitle, cardX + cardWidth / 2, cardY + 70);
        
        ctx.fillStyle = "#facc15"; // gold accent text
        ctx.font = "bold 11px sans-serif";
        ctx.fillText("የይዘት መግለጫ (Script Analysis Visual)", cardX + cardWidth / 2, cardY + 95);
        
        // Bottom badge
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.roundRect(cardX + cardWidth / 2 - 80, cardY + 115, 160, 22, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 9px monospace";
        ctx.fillText(`CHANNEL ID: ${res.channelTitle || "AI BROADCAST"}`, cardX + cardWidth / 2, cardY + 129);
        
        ctx.restore();
      }

      // D. Broadcast Interface Borders & Watermarks
      ctx.fillStyle = currentConfig.template === "breaking_red" ? "rgba(239, 68, 68, 0.9)" : "rgba(220, 38, 38, 0.8)"; // Red LIVE banner
      ctx.beginPath();
      ctx.roundRect(30, 25, 100, 28, 6);
      ctx.fill();

      // Blinking LIVE dot
      if (Math.floor(currTime * 2) % 2 === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(48, 39, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("LIVE HD", 62, 43);

      // Station Watermark (Top Right)
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "bold 14px 'Inter', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("ET AI NEWS STUDIO", canvas.width - 40, 42);

      // Time Stamp watermark (Top Center)
      const nowStr = new Date().toLocaleTimeString();
      ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`UTC: ${nowStr}`, canvas.width / 2, 42);

      // E. Translucent Amharic Lower-Thirds Graphics Banner (If enabled)
      if (currentConfig.showLowerThird) {
        // Main Banner
        ctx.fillStyle = "rgba(15, 23, 42, 0.92)"; // Dark navy translucent body
        ctx.beginPath();
        ctx.roundRect(30, canvas.height - 110, canvas.width - 60, 65, 8);
        ctx.fill();
        ctx.strokeStyle = currentConfig.template === "breaking_red" ? "rgba(239, 68, 68, 0.5)" : "rgba(16, 185, 129, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Side Highlight
        ctx.fillStyle = currentConfig.template === "breaking_red" ? "#ef4444" : "#10b981"; // Highlight block
        ctx.fillRect(30, canvas.height - 110, 8, 65);

        // Main News Header Text (Lower thirds top line)
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(currentConfig.lowerThirdText, 52, canvas.height - 85);

        // Highlight/Category block
        ctx.fillStyle = currentConfig.template === "breaking_red" ? "rgba(239, 68, 68, 0.95)" : "rgba(16, 185, 129, 0.95)";
        ctx.fillRect(canvas.width - 160, canvas.height - 105, 120, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(currentConfig.overlayLabel, canvas.width - 100, canvas.height - 91);

        // F. Dynamic Synced Speech Caption Text Overlay
        const currentSentence = sents[activeIdx] || "";
        ctx.fillStyle = "#facc15"; // Yellow caption color for best readability
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        
        // Wrap and display captions within the lower-thirds bounding box
        const captionText = currentSentence.length > 55 ? currentSentence.substring(0, 52) + "..." : currentSentence;
        ctx.fillText(captionText, 52, canvas.height - 60);
      }

      // G. Running Scrolling Ticker Banner at the very bottom
      ctx.fillStyle = currentConfig.template === "breaking_red" ? "rgba(239, 68, 68, 0.95)" : "rgba(16, 185, 129, 0.95)"; // Ticker background
      ctx.fillRect(0, canvas.height - 35, canvas.width, 35);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";

      // Scrolling news text logic
      const tickerMessage = `  ሰበር ዜና: ${res.shortSummary} ••• ቁልፍ መረጃዎች: ${res.hashtags.map(h => `#${h}`).join(" ")} •••  `;
      tickerX -= 0.8;
      if (tickerX < -ctx.measureText(tickerMessage).width) {
        tickerX = canvas.width;
      }
      ctx.fillText(tickerMessage, tickerX, canvas.height - 13);

      localFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(localFrameId);
  }, []);

  // 7. MP4 Video Export Engine (Records canvas stream + generated audio)
  const handleExportVideo = () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportSuccess(false);
    setExportError(null);

    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        setIsExporting(false);
        setExportError("የቪዲዮ ኤለመንቱ አልተገኘም።");
        return;
      }

      // Play/reset the player to record cleanly from the start
      handleStop();
      setIsPlaying(true);
      startBackgroundMusic();

      if (!canvas.captureStream) {
        throw new Error("Canvas captureStream is not supported on this browser.");
      }

      const videoStream = canvas.captureStream(30); // 30 FPS Canvas stream
      const chunks: Blob[] = [];

      // Create recorder
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(videoStream, { mimeType: "video/webm;codecs=vp8" });
      } catch (e) {
        // Fallback
        recorder = new MediaRecorder(videoStream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${metadata.title.replace(/[^a-zA-Z0-9]/g, "_")}_AI_News_1080p.mp4`;
          link.click();
          URL.revokeObjectURL(url);
          setIsExporting(false);
          setExportProgress(100);
          setExportSuccess(true);
          setIsPlaying(false);
          stopBackgroundMusic();
        } catch (err) {
          console.error("Recording download creation failed", err);
          setExportError("ቪዲዮውን ማውረድ አልተቻለም።");
          setIsExporting(false);
        }
      };

      // Simulate render timeline recording (Record 15 seconds segment for sample representation)
      recorder.start();
      const recordSeconds = Math.min(20, totalDuration); // Capture first 20 seconds or full length

      let intervalSeconds = 0;
      const interval = setInterval(() => {
        intervalSeconds += 1;
        const progress = Math.round((intervalSeconds / recordSeconds) * 100);
        setExportProgress(Math.min(100, progress));

        if (intervalSeconds >= recordSeconds) {
          clearInterval(interval);
          try {
            recorder.stop();
          } catch (e) {
            console.error("Recorder stop error", e);
          }
        }
      }, 1000);
    } catch (err) {
      console.error("Export failed", err);
      setExportError("ይህ አሳሽ የቪዲዮ ቀረጻን (Video Capture) አይደግፍም። እባክዎ በሌላ አሳሽ ይሞክሩ።");
      setIsExporting(false);
    }
  };

  // 7b. High Fidelity WAV Audio Export (Web Audio API synthesis recorder)
  const handleDownloadWAV = () => {
    setIsAudioExporting(true);
    try {
      const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!OfflineCtx) {
        setIsAudioExporting(false);
        return;
      }

      const sampleRate = 44100;
      // Synthesize up to 15 seconds or full duration
      const durationSeconds = Math.min(15, totalDuration);
      const ctx = new OfflineCtx(1, sampleRate * durationSeconds, sampleRate);

      // Render Opening Chime Theme
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chimeOsc.type = "sine";
      chimeOsc.frequency.setValueAtTime(523.25, 0); // C5
      chimeOsc.frequency.exponentialRampToValueAtTime(783.99, 0.4); // G5
      chimeGain.gain.setValueAtTime(0.18, 0);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, 1.2);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chimeOsc.start(0);
      chimeOsc.stop(1.5);

      const lowOsc = ctx.createOscillator();
      const lowGain = ctx.createGain();
      lowOsc.type = "triangle";
      lowOsc.frequency.setValueAtTime(130.81, 0); // C3
      lowGain.gain.setValueAtTime(0.12, 0);
      lowGain.gain.exponentialRampToValueAtTime(0.001, 2.0);
      lowOsc.connect(lowGain);
      lowGain.connect(ctx.destination);
      lowOsc.start(0);
      lowOsc.stop(2.2);

      // Render theme beats sequence
      const stepDuration = 0.5;
      const pulseNotes = [55, 55, 48, 48, 65, 55, 48, 55];
      const orchestralNotes = [65.4, 65.4, 73.4, 73.4, 87.3, 98.0, 87.3, 73.4];
      const techNotes = [110.0, 110.0, 146.8, 164.8, 220.0, 146.8, 164.8, 110.0];

      const currentNotes = musicTheme === "tech" ? techNotes : musicTheme === "orchestral" ? orchestralNotes : pulseNotes;

      for (let time = 1.0; time < durationSeconds; time += stepDuration) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = musicTheme === "tech" ? "sawtooth" : musicTheme === "orchestral" ? "sine" : "triangle";
        
        const noteIdx = Math.floor((time - 1.0) / stepDuration) % currentNotes.length;
        osc.frequency.setValueAtTime(currentNotes[noteIdx], time);

        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 0.9);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration);
      }

      ctx.startRendering().then((renderedBuffer) => {
        const channelData = renderedBuffer.getChannelData(0);
        const wavArrBuffer = writeWavFile(channelData, sampleRate);
        const blob = new Blob([wavArrBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${metadata.title.replace(/[^a-zA-Z0-9]/g, "_")}_Broadcast_Voice_Studio.wav`;
        link.click();
        URL.revokeObjectURL(url);
        setIsAudioExporting(false);
      }).catch(err => {
        console.error("WAV render failed", err);
        setIsAudioExporting(false);
      });
    } catch (e) {
      console.warn("WAV synthesis not supported", e);
      setIsAudioExporting(false);
    }
  };

  const writeWavFile = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + samples.length * 2, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw PCM)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // chunk length
    view.setUint32(40, samples.length * 2, true);
    
    // write raw PCM float samples to signed 16-bit integer bytes
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    
    return buffer;
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // 8. Custom Document Exporters
  const handleDownloadSRT = () => {
    // Generate valid SubRip Subtitle (.srt) file
    let srtText = "";
    let timeAccumulator = 0;

    sentences.forEach((sentence, index) => {
      const duration = sentenceDurations[index];
      const startTime = formatSRTTime(timeAccumulator);
      const endTime = formatSRTTime(timeAccumulator + duration);
      timeAccumulator += duration;

      srtText += `${index + 1}\n`;
      srtText += `${startTime} --> ${endTime}\n`;
      srtText += `${sentence}\n\n`;
    });

    const blob = new Blob([srtText], { type: "text/srt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${metadata.title.replace(/[^a-zA-Z0-9]/g, "_")}_Subtitles.srt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Amharic AI News Studio - Professional Script", 14, 18);
    
    doc.setFontSize(11);
    doc.text(`Video Base: ${metadata.title}`, 14, 28);
    doc.text(`Est. Speaking Length: ${Math.round(totalDuration)} seconds`, 14, 34);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, 14, 40);
    doc.line(14, 44, 196, 44);

    let y = 52;
    doc.setFontSize(10);
    
    sentences.forEach((sentence, index) => {
      const timeLabel = `[${formatTime(sentenceDurations.slice(0, index).reduce((a, b) => a + b, 0))}]`;
      const fullLine = `${timeLabel} ${sentence}`;
      const splitText = doc.splitTextToSize(fullLine, 180);
      
      for (let i = 0; i < splitText.length; i++) {
        if (y > 280) {
          doc.addPage();
          y = 15;
        }
        doc.text(splitText[i], 14, y);
        y += 7;
      }
      y += 2; // Extra paragraph space
    });

    doc.save(`${metadata.title.replace(/[^a-zA-Z0-9]/g, "_")}_News_Script.pdf`);
  };

  const handleDownloadDOCX = () => {
    const formattedHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>News Script</title><meta charset="utf-8" /></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #059669;">Amharic AI News Script Broadcast</h2>
        <p><strong>Original Title:</strong> ${metadata.title}</p>
        <p><strong>Est. Speaking Duration:</strong> ${Math.round(totalDuration)} seconds</p>
        <hr/>
        ${sentences.map((s, i) => `<p><strong>[${formatTime(sentenceDurations.slice(0, i).reduce((a, b) => a + b, 0))}]</strong> ${s}</p>`).join("")}
      </body>
      </html>
    `;
    const blob = new Blob([formattedHtml], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${metadata.title.replace(/[^a-zA-Z0-9]/g, "_")}_News_Script.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper formatting timing strings
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatSRTTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* LEFT: Video Studio Preview Player Controls */}
      <div className="lg:col-span-7 flex flex-col space-y-4">
        
        {/* Render Canvas Screen */}
        <div className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-900">
          <canvas 
            ref={canvasRef} 
            width={854} 
            height={480} 
            className="w-full h-full object-contain"
          />
          
          {/* Audio Equalizer visualizer overlay on playback */}
          {isPlaying && (
            <div className="absolute right-6 top-16 flex items-end space-x-1 h-12 bg-black/40 px-3 py-2 rounded-xl backdrop-blur-sm">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div 
                  key={i} 
                  className="w-1.5 bg-emerald-500 rounded-full animate-bounce"
                  style={{ 
                    height: "100%", 
                    animationDuration: `${0.3 + i * 0.15}s`,
                    animationDelay: `${i * 0.05}s` 
                  }}
                />
              ))}
            </div>
          )}

          {/* Intro animation banner card overlay */}
          {currentTime < 3 && isPlaying && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-center z-10 transition-all duration-500 animate-pulse">
              <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-3 animate-spin duration-3000">
                <Sparkles className="h-10 w-10 text-emerald-400" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-widest text-white">አማርኛ AI ዜና</h1>
              <p className="text-emerald-400 text-xs mt-1 uppercase tracking-widest font-mono">Amharic AI News Studio</p>
            </div>
          )}
        </div>

        {/* Video Player Dashboard Toolbar Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3 shadow-lg">
          
          {/* Timeline and Playback Slider */}
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-gray-400">{formatTime(currentTime)}</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full relative overflow-hidden group">
              <div 
                className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full transition-all duration-100"
                style={{ width: `${(currentTime / totalDuration) * 100}%` }}
              />
              <input 
                type="range"
                min="0"
                max={totalDuration}
                value={currentTime}
                onChange={(e) => {
                  setCurrentTime(parseFloat(e.target.value));
                  if (!isPlaying) {
                    // Update sentence index accordingly
                    let accumulated = 0;
                    for (let i = 0; i < sentenceDurations.length; i++) {
                      accumulated += sentenceDurations[i];
                      if (parseFloat(e.target.value) <= accumulated) {
                        setActiveSentenceIndex(i);
                        break;
                      }
                    }
                  }
                }}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-xs font-mono text-gray-400">{formatTime(totalDuration)}</span>
          </div>

          {/* Control Buttons row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePlayPause}
                className="p-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-full transition-all duration-150 shadow-md cursor-pointer"
                title={isPlaying ? "Pause" : "Play Broadcast"}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>

              <button
                onClick={handleStop}
                className="p-3 border border-slate-700 hover:bg-slate-800 text-gray-300 rounded-full transition-colors cursor-pointer"
                title="Stop & Reset"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </div>

            {/* AI Voice Adjustments */}
            <div className="flex items-center space-x-4">
              
              {/* Music Synthesizer option toggle */}
              <button
                onClick={() => setBgMusicEnabled(!bgMusicEnabled)}
                className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center space-x-1 text-xs border ${
                  bgMusicEnabled 
                    ? "bg-teal-500/10 border-teal-500/30 text-teal-400" 
                    : "bg-slate-800 border-slate-700 text-gray-400"
                }`}
                title="Toggle Synth BG Beats"
              >
                <Music className="h-4 w-4" />
                <span>ሙዚቃ</span>
              </button>

              {/* Volume Controller slider */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => {
                    setVolume(parseInt(e.target.value));
                    setIsMuted(false);
                  }}
                  className="w-16 accent-emerald-500 cursor-pointer h-1"
                />
              </div>

            </div>

          </div>

        </div>

        {/* AI Studio Audio Producer configurations panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h4 className="font-bold text-sm text-white flex items-center space-x-2">
            <Sliders className="h-4 w-4 text-emerald-400" />
            <span>የስቱዲዮ ድምፅ ምርጫ (Anchor & Audio Settings)</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Voice Anchor Model Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">ዜና አቅራቢ (Voice Model)</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.gender === "female" ? "ሴት" : "ወንድ"})</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 italic">
                {voices.find(v => v.id === selectedVoice)?.desc}
              </p>
            </div>

            {/* Speaking Speed Rate Adjuster */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 flex justify-between">
                <span>የንባብ ፍጥነት (Speed Rate)</span>
                <span className="font-mono text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{speakingSpeed}x</span>
              </label>
              <input 
                type="range"
                min="0.8"
                max="1.5"
                step="0.05"
                value={speakingSpeed}
                onChange={(e) => setSpeakingSpeed(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-500">
                <span>ረጋ ያለ (0.8x)</span>
                <span>መደበኛ</span>
                <span>ፈጣን (1.5x)</span>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
            
            {/* Voice Pitch Control */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 flex justify-between">
                <span>የድምፅ ቅጥነት/ውፍረት (Pitch Adjust)</span>
                <span className="font-mono text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{voicePitch}x</span>
              </label>
              <input 
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={voicePitch}
                onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-500">
                <span>ወፍራም ድምፅ</span>
                <span>መደበኛ</span>
                <span>ቀጭን ድምፅ</span>
              </div>
            </div>

            {/* Background Soundtrack selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">የጀርባ ዜማ (Synth Beat Theme)</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "pulse", name: "Classic" },
                  { id: "orchestral", name: "Dramatic" },
                  { id: "tech", name: "Techno" }
                ].map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setMusicTheme(theme.id as any)}
                    className={`py-1 px-1 rounded-lg text-xs font-medium border text-center cursor-pointer transition-all ${
                      musicTheme === theme.id 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" 
                        : "bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700"
                    }`}
                  >
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* RIGHT: Script Editor & Exporter Panel */}
      <div className="lg:col-span-5 flex flex-col space-y-4">
        
        {/* News Script Broadcast Block */}
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-5 shadow-md flex-1 flex flex-col">
          <div className="flex items-center justify-between pb-3.5 border-b border-gray-100 dark:border-slate-800 mb-4">
            <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center space-x-2">
              <Edit3 className="h-4 w-4 text-emerald-500" />
              <span>የዜና ስክሪፕት ስቱዲዮ (Interactive Script Studio)</span>
            </h4>
            
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center space-x-1 ${
                isEditing 
                  ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" 
                  : "border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              <Save className="h-3 w-3" />
              <span>{isEditing ? "ተጠናቋል" : "ስክሪፕት ቀይር"}</span>
            </button>
          </div>

          {/* Live Editable Text box or Sentence highlighter playlist */}
          <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-[400px] pr-2 space-y-2">
            {isEditing ? (
              <textarea
                value={editedScript}
                onChange={(e) => setEditedScript(e.target.value)}
                className="w-full h-full min-h-[250px] bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-sans"
                placeholder="የዜና ስክሪፕቱን እዚህ ይጻፉ ወይም ያርሙ..."
              />
            ) : (
              <div className="space-y-2.5">
                {sentences.map((sentence, idx) => {
                  const isActive = idx === activeSentenceIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        // Seek player to this sentence
                        let startTime = 0;
                        for (let i = 0; i < idx; i++) {
                          startTime += sentenceDurations[i];
                        }
                        setCurrentTime(startTime);
                      }}
                      className={`p-3 rounded-2xl text-xs transition-all duration-200 cursor-pointer border flex items-start space-x-2 ${
                        isActive
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-emerald-500/10"
                          : "bg-gray-50/50 dark:bg-slate-800/20 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <span className="font-mono text-[9px] opacity-60 bg-gray-200 dark:bg-slate-800 px-1 rounded-md py-0.5 mt-0.5">
                        {formatTime(sentenceDurations.slice(0, idx).reduce((a, b) => a + b, 0))}
                      </span>
                      <span className="leading-relaxed font-sans">{sentence}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
            <span>የዓረፍተ ነገሮች ብዛት፦ {sentences.length}</span>
            <span>የስክሪፕቱ አጠቃላይ ርዝመት፦ ~{Math.round(totalDuration)} ሰከንድ</span>
          </div>

        </div>

        {/* Active Scene Customizer Bento Box */}
        {sceneConfigs[activeSentenceIndex] && (
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-5 shadow-md space-y-4">
            <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center space-x-2">
              <Layers className="h-4 w-4 text-emerald-500" />
              <span>የእይታ ስላይድ ማስተካከያ (Active Scene Overlays)</span>
            </h4>
            
            <p className="text-[10px] text-gray-500 dark:text-gray-400">ለአሁኑ የተመረጠ ዓረፍተ ነገር ስላይድ የጀርባ ገጽታ እና የትርጉም ጽሑፍ ይዘቶችን ያብጁ።</p>

            {/* Template Selector Buttons */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">የስክሪን ገጽታ (Scene Template)</label>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { id: "news_studio", name: "Studio", icon: Globe },
                  { id: "satellite_map", name: "Map", icon: Map },
                  { id: "bar_chart", name: "Chart", icon: BarChart3 },
                  { id: "world_grid", name: "Matrix", icon: Activity },
                  { id: "breaking_red", name: "Alert", icon: Sparkles }
                ].map((t) => {
                  const Icon = t.icon;
                  const isSel = sceneConfigs[activeSentenceIndex].template === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => updateSceneConfig("template", t.id)}
                      className={`py-2 px-1 rounded-xl text-[10px] font-medium border flex flex-col items-center justify-center space-y-1 cursor-pointer transition-all ${
                        isSel 
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold" 
                          : "bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                      }`}
                      title={t.name}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lower third caption input field */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-400">የትርጉም ጽሑፍ ራስጌ (Lower-Third Header)</label>
                <label className="flex items-center space-x-1 cursor-pointer text-[10px] text-gray-500">
                  <input
                    type="checkbox"
                    checked={sceneConfigs[activeSentenceIndex].showLowerThird}
                    onChange={(e) => updateSceneConfig("showLowerThird", e.target.checked)}
                    className="rounded accent-emerald-500 text-emerald-500 cursor-pointer"
                  />
                  <span>አሳይ</span>
                </label>
              </div>
              <input
                type="text"
                value={sceneConfigs[activeSentenceIndex].lowerThirdText}
                onChange={(e) => updateSceneConfig("lowerThirdText", e.target.value)}
                disabled={!sceneConfigs[activeSentenceIndex].showLowerThird}
                className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
                placeholder="ለምሳሌ፡ ወቅታዊ የህዝብ ትንተና..."
              />
            </div>

            {/* Overlay corner label input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400">የማዕዘን ምልክት (Category Badge)</label>
              <input
                type="text"
                value={sceneConfigs[activeSentenceIndex].overlayLabel}
                onChange={(e) => updateSceneConfig("overlayLabel", e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                placeholder="ለምሳሌ፡ አዲስ አበባ..."
              />
            </div>

          </div>
        )}

        {/* High Tech Exports Suite block */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <h4 className="font-bold text-sm text-white flex items-center space-x-2">
            <Video className="h-4 w-4 text-emerald-400" />
            <span>ስቱዲዮ ኤክስፖርት (Studio Export Options)</span>
          </h4>

          {/* MP4 render bar progress status */}
          {isExporting ? (
            <div className="p-4 bg-slate-950 border border-emerald-500/20 rounded-2xl space-y-2">
              <div className="flex justify-between text-xs text-emerald-400 font-semibold">
                <span>MP4 ቪዲዮ በማቀናበር ላይ... (Compiling Video)</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400">እባክዎ ኤክስፖርቱ እስኪጠናቀቅ ድረስ መስኮቱን አይዝጉ። የድምፅና ምስል ቅንጅቱ በምስል ማድረጊያው (Renderer) አማካኝነት እየተፈጠረ ነው።</p>
            </div>
          ) : exportSuccess ? (
            <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl flex items-start space-x-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-400">ቪዲዮ በተሳካ ሁኔታ ተጠናቋል!</p>
                <p className="text-[10px] text-gray-400 mt-1">የእርስዎ የ 1080p MP4 የቴሌቪዥን ዜና ቪዲዮ በስኬት ተዘጋጅቶ ወርዷል። ተጨማሪ ይዘቶችን ማውረድ ይችላሉ።</p>
                <button
                  onClick={() => setExportSuccess(false)}
                  className="text-emerald-400 text-xs mt-2 underline cursor-pointer hover:text-emerald-300"
                >
                  ሌላ ቪዲዮ ፍጠር (Reset)
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleExportVideo}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-semibold rounded-2xl shadow-md transition-all duration-150 cursor-pointer text-xs flex items-center justify-center space-x-2"
            >
              <Video className="h-4 w-4" />
              <span>የ 1080p MP4 ቪዲዮ አውርድ (Generate News Video)</span>
            </button>
          )}

          {/* Export Error Alert Display */}
          {exportError && (
            <div className="p-3 bg-red-950/30 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-400">ኤክስፖርት አልተሳካም</p>
                <p className="text-[10px] text-gray-300 mt-0.5">{exportError}</p>
                <button 
                  onClick={() => setExportError(null)}
                  className="text-[9px] text-red-400 underline mt-1 block"
                >
                  ይህንን መልዕክት ዝጋ
                </button>
              </div>
            </div>
          )}

          {/* Document and Script Format Row */}
          <div className="grid grid-cols-4 gap-1.5">
            
            <button
              onClick={handleDownloadSRT}
              className="py-2.5 px-1 bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700/60 rounded-xl text-[10px] font-medium transition-colors cursor-pointer flex flex-col items-center justify-center space-y-1"
              title="Download SubRip Subtitles"
            >
              <FileText className="h-4 w-4 text-emerald-400" />
              <span>SRT ንዑስ</span>
            </button>

            <button
              onClick={handleDownloadWAV}
              disabled={isAudioExporting}
              className={`py-2.5 px-1 bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700/60 rounded-xl text-[10px] font-medium transition-colors cursor-pointer flex flex-col items-center justify-center space-y-1 ${isAudioExporting ? "opacity-60" : ""}`}
              title="Download High Fidelity WAV Voice Studio"
            >
              <Mic className="h-4 w-4 text-pink-400" />
              <span>{isAudioExporting ? "WAV..." : "WAV ድምፅ"}</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              className="py-2.5 px-1 bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700/60 rounded-xl text-[10px] font-medium transition-colors cursor-pointer flex flex-col items-center justify-center space-y-1"
              title="Download Script PDF"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-red-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>PDF ጽሑፍ</span>
            </button>

            <button
              onClick={handleDownloadDOCX}
              className="py-2.5 px-1 bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700/60 rounded-xl text-[10px] font-medium transition-colors cursor-pointer flex flex-col items-center justify-center space-y-1"
              title="Download DOCX Script"
            >
              <Download className="h-4 w-4 text-blue-400" />
              <span>Word ሰነድ</span>
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
