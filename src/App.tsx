import React, { useState, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy 
} from "firebase/firestore";
import { 
  Youtube, Sparkles, AlertCircle, ArrowRight, Loader2,
  Bookmark, Newspaper, RefreshCw, KeyRound, Mail, User as UserIcon
} from "lucide-react";

import { auth, db, initAuth, googleSignIn, logoutUser, getAccessToken } from "./lib/firebase";
import { AnalysisResults, SavedAnalysis, VideoMetadata } from "./types";
import Navbar from "./components/Navbar";
import HistorySidebar from "./components/HistorySidebar";
import ResultsTabs from "./components/ResultsTabs";
import GsiButton from "./components/GsiButton";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  // Theme State
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem("theme") === "dark" || 
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  // User & OAuth Token State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Authentication UI State
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Core App & Form State
  const [urlInput, setUrlInput] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [useDeepSearch, setUseDeepSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<SavedAnalysis | null>(null);
  const [historyList, setHistoryList] = useState<SavedAnalysis[]>([]);

  // Toggle theme helper
  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  // Synchronize CSS Dark Class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // Handle Auth Listeners on Load
  useEffect(() => {
    // 1. Listen for auth changes & read cached tokens if any
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      const token = getAccessToken();
      setAccessToken(token);
      setAuthInitialized(true);
    });

    // 2. Initialize OAuth state handler
    initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
      },
      () => {
        // Fallback
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch History from Firestore when User is Authenticated
  const fetchUserHistory = async (uid: string) => {
    try {
      const q = query(
        collection(db, "analyses"),
        where("userId", "==", uid),
        orderBy("createdAt", "desc")
      );
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "analyses");
        return;
      }
      const analyses: SavedAnalysis[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const url = data.url || "";
        const videoId = data.videoId || (
          url.includes("shorts/") 
            ? url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/)?.[1] 
            : url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/)?.[2] || "unknown"
        );
        analyses.push({
          id: doc.id,
          userId: data.userId,
          url: url,
          title: data.title,
          author: data.author,
          thumbnail: data.thumbnail,
          videoId: videoId,
          createdAt: data.createdAt,
          results: data.results as AnalysisResults,
          isMock: data.isMock || false
        });
      });
      setHistoryList(analyses);
    } catch (error) {
      console.error("Error loading analysis history:", error);
    }
  };

  // Trigger Fetch History on Auth Change
  useEffect(() => {
    if (user) {
      fetchUserHistory(user.uid);
    } else {
      setHistoryList([]);
      setActiveAnalysis(null);
    }
  }, [user]);

  // Google Single-Sign-On Callback
  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        await fetchUserHistory(result.user.uid);
      }
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user") {
        setAuthError("የመግቢያ መስኮቱ ተዘግቷል። እባክዎ በድጋሚ በመጫን ይሞክሩ።");
      } else {
        setAuthError(err.message || "በጉግል መግባት አልተሳካም። እባክዎ እንደገና ይሞክሩ።");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Custom Email/Password Signup
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPass || !authName) {
      setAuthError("እባክዎ ሁሉንም መስኮች በትክክል ይሙሉ");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail, authPass);
      await updateProfile(cred.user, { displayName: authName });
      setUser(cred.user);
      await fetchUserHistory(cred.user.uid);
    } catch (err: any) {
      let code = err.code;
      if (code === "auth/email-already-in-use") {
        setAuthError("ይህ የኢሜል አድራሻ አስቀድሞ ጥቅም ላይ ውሏል።");
      } else if (code === "auth/weak-password") {
        setAuthError("የይለፍ ቃሉ በጣም ደካማ ነው። ቢያንስ 6 ቁምፊዎች ያስፈልጋሉ።");
      } else {
        setAuthError(err.message || "መመዝገብ አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Custom Email/Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPass) {
      setAuthError("እባክዎ ኢሜልና የይለፍ ቃል ያስገቡ");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail, authPass);
      setUser(cred.user);
      await fetchUserHistory(cred.user.uid);
    } catch (err: any) {
      let code = err.code;
      if (code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setAuthError("የገቡት የኢሜል አድራሻ ወይም የይለፍ ቃል የተሳሳተ ነው።");
      } else {
        setAuthError(err.message || "መግባት አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign out helper
  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setAccessToken(null);
    setHistoryList([]);
    setActiveAnalysis(null);
    setUrlInput("");
    setCustomContext("");
  };

  // Core YouTube Analysis flow
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;
    if (!user) {
      setAnalysisError("ትንተና ለማካሄድ አስቀድመው መግባት አለብዎት።");
      return;
    }

    setLoading(true);
    setAnalysisError(null);
    
    // Progress loop
    const steps = [
      "የቪዲዮ አድራሻውን በመፈተሽ ላይ... (Checking YouTube Video URL)",
      "የቪዲዮ መረጃዎችን እያነበብን ነው... (Fetching video details)",
      "የጉግል ጀሚኒ AI ትንተና እየጀመረ ነው... (Initializing Gemini AI Engine)",
      "ቪዲዮውን በመስማትና ሙሉ የአማርኛ ትርጉም በማዘጋጀት ላይ... (Transcribing into Amharic)",
      "የተናጋሪዎችን ማንነትና የሰዓት ክፍፍል እየለየን ነው... (Identifying speakers and timelines)",
      "ጋዜጣዊ መግለጫና የሰበር ዜናዎችን በመፍጠር ላይ... (Drafting news article & breaking alerts)",
      "ለማህበራዊ ሚዲያ (ፌስቡክ፣ ቴሌግራም) ተስማሚ ጽሑፎችን በመጻፍ ላይ... (Generating Facebook & Telegram posts)",
      "የዩቲዩብ ርዕሶችን፣ መግለጫዎችንና የታምብኔል ፅሁፎችን በማጠናቀር ላይ... (Optimizing YouTube CTR and metadata)",
      "ቁልፍ ቃላትንና ሃሽታጎችን በማውጣት ላይ... (Extracting SEO keywords & hashtags)",
      "የተሟላውን ዘገባ በማዘጋጀት ላይ... (Structuring final report package)"
    ];

    let currentStep = 0;
    setLoadingStep(steps[currentStep]);

    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        setLoadingStep(steps[currentStep]);
      }
    }, 3500);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          youtubeUrl: urlInput,
          customContext: customContext,
          isDemo: isDemoMode,
          useSearch: useDeepSearch
        })
      });

      const data = await response.json();
      clearInterval(interval);

      if (!response.ok || !data.success) {
        throw new Error(data.error || "ቪዲዮውን መተንተን አልተቻለም።");
      }

      const responseData = data.data;
      setLoadingStep("ዘገባውን በFirestore ዳታቤዝ ላይ በማስቀመጥ ላይ...");

      // Fulfill durable cloud persistence by saving to Firestore
      const newDoc = {
        userId: user.uid,
        url: urlInput,
        title: responseData.metadata.title,
        author: responseData.metadata.author,
        thumbnail: responseData.metadata.thumbnail,
        videoId: responseData.metadata.videoId || "unknown",
        createdAt: new Date().toISOString(),
        results: responseData.results,
        isMock: responseData.isMock || false
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, "analyses"), newDoc);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "analyses");
        return;
      }
      const savedItem: SavedAnalysis = {
        id: docRef.id,
        ...newDoc
      };

      // Add to front of list and select
      setHistoryList([savedItem, ...historyList]);
      setActiveAnalysis(savedItem);
      setUrlInput("");
      setCustomContext("");

    } catch (err: any) {
      clearInterval(interval);
      setAnalysisError(err.message || "የጀሚኒ AI ትንተና አልተሳካም። እባክዎ ትክክለኛ የዩቲዩብ አድራሻ ማስገባትዎን ያረጋግጡ።");
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete saved analysis from History
  const handleDeleteAnalysis = async (id: string) => {
    const isConfirmed = window.confirm("እርግጠኛ ነዎት ይህንን የተቀመጠ የዜና ትንተና መሰረዝ ይፈልጋሉ?");
    if (!isConfirmed) return;

    try {
      try {
        await deleteDoc(doc(db, "analyses", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `analyses/${id}`);
      }
      setHistoryList(historyList.filter((item) => item.id !== id));
      if (activeAnalysis?.id === id) {
        setActiveAnalysis(null);
      }
    } catch (error) {
      console.error("Failed to delete analysis:", error);
    }
  };

  // Loading indicator for Auth checking on mount
  if (!authInitialized) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-50 dark:bg-slate-950">
        <Loader2 className="h-10 w-10 text-emerald-500 animate-spin" />
        <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">
          የአማርኛ AI ዜና ስቱዲዮን በማዘጋጀት ላይ... (Starting Studio)
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FBFA] dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors duration-300">
      
      {/* Navbar Component */}
      <Navbar 
        user={user} 
        isDark={isDark} 
        toggleTheme={toggleTheme} 
        onLogout={handleLogout} 
      />

      {/* Auth Gate Screen (Login / Sign Up) */}
      {!user ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col lg:flex-row items-center justify-between gap-12">
          
          {/* Left Intro Text Column */}
          <div className="flex-1 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center space-x-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 px-3.5 py-1.5 rounded-full">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                AI-Powered Amharic Content Suite
              </span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
              ማንኛውንም የዩቲዩብ ቪዲዮ በቅጽበት ወደ <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">ሙያዊ የአማርኛ ዜናና ማህበራዊ ሚዲያ</span> ይቀይሩ።
            </h1>
            
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              በላቀ የጀሚኒ አርቴፊሻል ኢንተለጀንስ ታግዞ የዩቲዩብ ቪዲዮዎችንና ስርጭቶችን ይተነትናል፤ የተሟላ ትርጉም፣ ሰበር ዜናዎች፣ ዝርዝር ማጠቃለያዎች፣ የማህበራዊ ሚዲያ (ፌስቡክ፣ ቴሌግራም) ፖስቶችን እና የዩቲዩብ SEO መረጃዎችን በሰከንዶች ውስጥ ያዘጋጃል።
            </p>

            {/* Micro Feature Grid */}
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto lg:mx-0">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm">
                <span className="text-emerald-500 font-bold block text-lg">14+ ፎርማቶች</span>
                <span className="text-xs text-gray-500">ሙሉ ትርጉሞች፣ ሰበር ዜና፣ ማጠቃለያ...</span>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm">
                <span className="text-emerald-500 font-bold block text-lg">ቀጥታ መላኪያ</span>
                <span className="text-xs text-gray-500">ፋይሎችን በቀጥታ ወደ Google Docs/Drive ያስቀምጡ</span>
              </div>
            </div>
          </div>

          {/* Right Authentication Card Column */}
          <div className="w-full max-w-md">
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-8 shadow-xl">
              
              {/* Header Tab */}
              <div className="flex border-b border-gray-100 dark:border-slate-800 mb-6">
                <button
                  onClick={() => { setAuthView("login"); setAuthError(null); }}
                  className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                    authView === "login"
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  ግባ (Login)
                </button>
                <button
                  onClick={() => { setAuthView("signup"); setAuthError(null); }}
                  className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                    authView === "signup"
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  አዲስ አካውንት ክፈት (Sign Up)
                </button>
              </div>

              {/* Error messages */}
              {authError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center space-x-2 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Form Input fields */}
              <form onSubmit={authView === "login" ? handleEmailLogin : handleEmailSignup} className="space-y-4">
                {authView === "signup" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">ስም (Full Name)</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ሙሉ ስምዎን ያስገቡ"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                      <UserIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">ኢሜል (Email Address)</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="example@gmail.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">የይለፍ ቃል (Password)</label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={authPass}
                      onChange={(e) => setAuthPass(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm shadow-emerald-500/10 text-sm mt-6"
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>{authView === "login" ? "ግባ (Sign In)" : "ይመዝገቡ (Create Account)"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6 flex items-center justify-center">
                <div className="absolute inset-0 border-b border-gray-100 dark:border-slate-800" />
                <span className="relative px-3 bg-white dark:bg-slate-900 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  ወይም (OR)
                </span>
              </div>

              {/* Google Single Sign-on GsiButton */}
              <GsiButton onClick={handleGoogleLogin} isLoading={authLoading} />
              
              <div className="mt-4 p-3 bg-emerald-500/[0.03] rounded-2xl border border-emerald-500/5 text-center text-[10px] text-gray-500">
                የጉግል አካውንትዎን በመጠቀም ሲገቡ የዜና ዘገባዎችን በቀጥታ ወደ Google Docs ማመሳሰልና ማስቀመጥ ይችላሉ።
              </div>

            </div>
          </div>

        </div>
      ) : (
        /* Authenticated Dashboard Panel */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: History Sidebar (3 cols on desktop) */}
            <div className="lg:col-span-4 h-full">
              <HistorySidebar
                historyList={historyList}
                onSelect={(item) => setActiveAnalysis(item)}
                onDelete={handleDeleteAnalysis}
                activeId={activeAnalysis?.id}
              />
            </div>

            {/* Right Column: Analyzer & Display Tabs (8 cols on desktop) */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* YouTube Input Card */}
              <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <h3 className="font-sans font-extrabold text-gray-900 dark:text-white text-lg flex items-center space-x-2 mb-2">
                  <Sparkles className="h-5 w-5 text-emerald-500 animate-pulse" />
                  <span>አዲስ ትንተና ይጀምሩ (New Video Analysis)</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                  ለመተንተን የፈለጉትን የYouTube ቪዲዮ ወይም የቀጥታ ስርጭት (YouTube Live) ሊንክ ያስገቡ።
                </p>

                {/* English-to-Amharic Translation Feature Banner */}
                <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 dark:border-emerald-500/10 text-xs flex items-start space-x-3">
                  <span className="text-base shrink-0">🌍</span>
                  <div>
                    <p className="font-bold text-emerald-800 dark:text-emerald-400 mb-1">የእንግሊዝኛ ዜናዎችን ወደ አማርኛ ጽሑፍ መቀየርያ (English-to-Amharic Translation Mode)</p>
                    <p className="leading-relaxed text-[11px] text-gray-600 dark:text-gray-300">
                      የማንኛውንም በእንግሊዝኛ የተሰራ የዜና ቪዲዮ ሊንክ ያስገቡ። የቪዲዮውን የእንግሊዝኛ ጽሑፍ/ትራንስክሪፕት ከታች ባለው <strong className="text-emerald-700 dark:text-emerald-300">"ተጨማሪ የእንግሊዝኛ ጽሑፍ/ትራንስክሪፕት"</strong> ሳጥን ውስጥ በመለጠፍ ፍጹም የሆነ ጋዜጣዊ መግለጫ፣ ሰበር ዜና፣ ማጠቃለያ እና ሙሉ ትንታኔ በአማርኛ ቋንቋ በጽሑፍ ማግኘት ይችላሉ!
                    </p>
                  </div>
                </div>

                {/* Main Action Form */}
                <form onSubmit={handleAnalyze} className="space-y-4">
                  <div className="relative">
                    <input
                      type="url"
                      placeholder="የዩቲዩብ ቪዲዮ ሊንክ ያስገቡ (ለምሳሌ፦ https://www.youtube.com/watch?v=...)"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      disabled={loading}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <Youtube className="absolute left-4 top-3.5 h-5 w-5 text-red-500" />
                  </div>

                  {/* Supplemental Context Box (Collapse helper) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                      ተጨማሪ የእንግሊዝኛ ጽሑፍ/ትራንስክሪፕት ወይም አውድ (Paste English News Text / Transcript to Translate)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="የእንግሊዝኛውን የዜና ጽሑፍ ወይም የቪዲዮውን ትራንስክሪፕት እዚህ ይለጥፉ። ጀሚኒ AI ጽሑፉን ተርጉሞ በአጭር ሰከንዶች ውስጥ 14 አይነት የተለያዩ ይዘቶችን በአማርኛ ጽሑፍ ያዘጋጅልዎታል።"
                      value={customContext}
                      onChange={(e) => setCustomContext(e.target.value)}
                      disabled={loading}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                    />
                  </div>

                  {/* Toggles: Demo Mode & Deep Search */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-850 rounded-2xl cursor-pointer select-none hover:bg-gray-100/50 dark:hover:bg-slate-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={isDemoMode}
                        onChange={(e) => setIsDemoMode(e.target.checked)}
                        disabled={loading}
                        className="rounded border-gray-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                      <div>
                        <span className="block text-xs font-bold text-gray-800 dark:text-gray-200">ፈጣን የሙከራ ሁነታ (Demo/Draft Mode)</span>
                        <span className="block text-[10px] text-gray-500">የGemini AI Quota ሳያስፈልግ በ1 ሴኮንድ ለመሞከር</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-850 rounded-2xl cursor-pointer select-none hover:bg-gray-100/50 dark:hover:bg-slate-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={useDeepSearch}
                        onChange={(e) => setUseDeepSearch(e.target.checked)}
                        disabled={loading}
                        className="rounded border-gray-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                      <div>
                        <span className="block text-xs font-bold text-gray-800 dark:text-gray-200">የጉግል ፍለጋ ማረጋገጫ (Google Search Grounding)</span>
                        <span className="block text-[10px] text-gray-500">ርዕሰ ጉዳዩን በኢንተርኔት ላይ በጥልቀት ለመመርመር (ዘግየት ይላል)</span>
                      </div>
                    </label>
                  </div>

                  {/* Analyze Trigger Button */}
                  <div className="flex items-center justify-between pt-2">
                    {/* drive notification reminder */}
                    <div className="text-[10px] text-gray-400 max-w-[280px] leading-tight">
                      {!accessToken ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">💡 ማሳሰቢያ፦ ወደ Google Drive በቀጥታ ለመላክ በጉግል አካውንት ይግቡ።</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ የGoogle Drive ማመሳሰል ዝግጁ ነው።</span>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !urlInput}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl flex items-center space-x-2 transition-all cursor-pointer shadow-sm shadow-emerald-500/10 text-sm"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>ትንተና ላይ... (Analyzing)</span>
                        </>
                      ) : (
                        <>
                          <span>ይተንትኑ (Analyze Video)</span>
                          <Sparkles className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Analysis Errors Overlay */}
                {analysisError && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-start space-x-3 text-xs">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block mb-1">የትንተና ስህተት አጋጥሟል</span>
                      <span className="block">{analysisError}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Processing Progress Indicator Card */}
              {loading && (
                <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-center space-y-4 shadow-sm animate-pulse">
                  <div className="relative flex items-center justify-center">
                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                    <Sparkles className="h-6 w-6 text-emerald-500 absolute" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-base">ቪዲዮውን በመተንተን ላይ... (Analyzing Video)</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                      የጀሚኒ AI ሞዴል ቪዲዮውን በጥልቀት እየተነተነ ነው። እባክዎ ለጥቂት ሰከንዶች ይጠብቁ...
                    </p>
                  </div>
                  
                  {/* Progress Step Subtitle */}
                  <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[11px] font-bold text-emerald-700 dark:text-emerald-400 max-w-md">
                    {loadingStep}
                  </div>
                </div>
              )}

              {/* Loaded Analysis Results Dashboard */}
              {activeAnalysis && !loading && (
                <ResultsTabs
                  results={activeAnalysis.results}
                  metadata={{
                    title: activeAnalysis.title,
                    author: activeAnalysis.author,
                    thumbnail: activeAnalysis.thumbnail,
                    videoId: activeAnalysis.videoId
                  }}
                  accessToken={accessToken}
                  isMock={activeAnalysis.isMock}
                />
              )}

              {/* Splash Dashboard Empty Screen (When no active selection) */}
              {!activeAnalysis && !loading && (
                <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <Newspaper className="h-8 w-8" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-base">የዜና ትንተና ስቱዲዮ ዝግጁ ነው</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mt-1 mx-auto">
                      አዲስ ቪዲዮ ለመተንተን ከላይ ሊንኩን ያስገቡ ወይም በግራ በኩል ካለው ዝርዝር ላይ ከዚህ ቀደም የተተነተኑ ዘገባዎችን መርጠው ይመልከቱ።
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Humble Footer Branding */}
      <footer className="mt-20 border-t border-gray-100 dark:border-slate-900 py-8 bg-white/50 dark:bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-400">
          <p>© 2026 Amharic AI News Studio. All Rights Reserved.</p>
          <div className="flex space-x-4 mt-4 sm:mt-0">
            <span className="font-mono text-[10px]">Powered by Google Gemini 3.5 & Firestore</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
