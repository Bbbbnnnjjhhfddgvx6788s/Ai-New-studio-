import React, { useState } from "react";
import { 
  Copy, Check, FileText, Download, Share2, 
  Newspaper, Layers, Compass, Youtube, CheckCircle, 
  ExternalLink, Chrome, Sparkles
} from "lucide-react";
import { jsPDF } from "jspdf";
import { AnalysisResults, VideoMetadata } from "../types";
import VideoStudio from "./VideoStudio";

interface ResultsTabsProps {
  results: AnalysisResults;
  metadata: VideoMetadata;
  accessToken: string | null;
  isMock?: boolean;
}

export default function ResultsTabs({ results, metadata, accessToken, isMock }: ResultsTabsProps) {
  // Category categorization
  const categories = [
    { id: "studio", name: "AI ዜና ስቱዲዮ (AI News Studio)", icon: Sparkles },
    { id: "news", name: "የዜና ጽሑፎች (News & Scripts)", icon: Newspaper },
    { id: "summaries", name: "ማጠቃለያዎች (Summaries)", icon: Layers },
    { id: "social", name: "የማህበራዊ ሚዲያ (Social Posts)", icon: Share2 },
    { id: "youtube", name: "የዩቲዩብና ፍለጋ (YouTube & SEO)", icon: Youtube }
  ];

  const [activeCategory, setActiveCategory] = useState("studio");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  // Google Drive Saving State
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveSuccess, setDriveSuccess] = useState<{ fileId: string; name: string } | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [exportTitle, setExportTitle] = useState(`${metadata.title} - የአማርኛ ሚዲያ ዘገባ`);
  const [exportAsDoc, setExportAsDoc] = useState(true);

  // Trigger copy feedback
  const handleCopy = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Local text download
  const downloadTxt = (title: string, text: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Local HTML/Word (.doc) download
  const downloadDoc = (title: string, text: string) => {
    const formattedHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>${title}</title><meta charset="utf-8" /></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>${title}</h2>
        <div style="white-space: pre-wrap;">${text.replace(/\n/g, "<br/>")}</div>
      </body>
      </html>
    `;
    const blob = new Blob([formattedHtml], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // JS PDF generation
  const downloadPdf = (title: string, text: string) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Amharic AI News Studio", 14, 15);
    doc.setFontSize(12);
    doc.text(`Title: ${metadata.title}`, 14, 25);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, 14, 32);
    
    doc.line(14, 36, 196, 36);
    
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(text, 180);
    
    let y = 45;
    for (let i = 0; i < splitText.length; i++) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(splitText[i], 14, y);
      y += 6;
    }
    doc.save(`${title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  };

  // Export Entire Package to TXT
  const downloadEntirePackage = () => {
    let fullText = `==================================================\n`;
    fullText += `AMHARIC AI NEWS STUDIO ANALYSIS REPORT\n`;
    fullText += `==================================================\n`;
    fullText += `Video: ${metadata.title}\n`;
    fullText += `URL: https://www.youtube.com/watch?v=${metadata.videoId}\n`;
    fullText += `Creator: ${metadata.author}\n`;
    fullText += `Date: ${new Date().toLocaleString()}\n\n`;

    fullText += `1. ሙሉ ትርጉም (FULL TRANSCRIPT):\n\n${results.transcript}\n\n`;
    fullText += `2. የተናጋሪዎች ማንነት (SPEAKER IDENTIFICATION):\n\n${results.speakers}\n\n`;
    fullText += `3. በጊዜ ገደብ የተከፋፈለ ጽሑፍ (TIMESTAMPED TRANSCRIPT):\n\n${results.timestampedTranscript}\n\n`;
    fullText += `4. አጭር ማጠቃለያ (SHORT SUMMARY):\n\n${results.shortSummary}\n\n`;
    fullText += `5. ዝርዝር ማጠቃለያ (LONG SUMMARY):\n\n${results.longSummary}\n\n`;
    fullText += `6. ጋዜጣዊ መግለጫ (NEWS ARTICLE):\n\n${results.newsArticle}\n\n`;
    fullText += `7. አስቸኳይ ሰበር ዜና (BREAKING NEWS):\n\n${results.breakingNews}\n\n`;
    fullText += `8. ፌስቡክ ጽሑፍ (FACEBOOK POST):\n\n${results.facebookPost}\n\n`;
    fullText += `9. ቴሌግራም ጽሑፍ (TELEGRAM POST):\n\n${results.telegramPost}\n\n`;
    fullText += `10. የዩቲዩብ ማብራሪያ (YOUTUBE DESCRIPTION):\n\n${results.youtubeDescription}\n\n`;
    
    fullText += `11. 20 የዩቲዩብ ርዕሶች (20 YOUTUBE TITLES):\n`;
    results.youtubeTitles.forEach((t, i) => { fullText += `- ${t}\n`; });
    
    fullText += `\n12. 20 የታምብኔል ጽሑፎች (20 THUMBNAIL TEXT IDEAS):\n`;
    results.thumbnailIdeas.forEach((t, i) => { fullText += `- ${t}\n`; });
    
    fullText += `\n13. 30 ታዋቂ ቁልፍ ቃላት (30 SEO KEYWORDS):\n`;
    results.seoKeywords.forEach((t, i) => { fullText += `- ${t}\n`; });
    
    fullText += `\n14. 20 ሃሽታጎች (20 HASHTAGS):\n`;
    results.hashtags.forEach((t, i) => { fullText += `#${t} `; });
    
    downloadTxt(`${metadata.title}_አጠቃላይ_ዘገባ`, fullText);
  };

  // Google Drive Save API triggering
  const handleSaveToDrive = async () => {
    if (!accessToken) return;
    setDriveSaving(true);
    setDriveError(null);
    setDriveSuccess(null);

    // Format content with categories
    let bodyText = `AMHARIC AI NEWS ANALYSIS REPORT\n\n`;
    bodyText += `Video Title: ${metadata.title}\n`;
    bodyText += `URL: https://www.youtube.com/watch?v=${metadata.videoId}\n\n`;
    bodyText += `--- 1. ሙሉ ትርጉም (TRANSCRIPT) ---\n${results.transcript}\n\n`;
    bodyText += `--- 2. የተናጋሪዎች ማንነት (SPEAKERS) ---\n${results.speakers}\n\n`;
    bodyText += `--- 3. ጋዜጣዊ መግለጫ (NEWS ARTICLE) ---\n${results.newsArticle}\n\n`;
    bodyText += `--- 4. ሰበር ዜና (BREAKING NEWS) ---\n${results.breakingNews}\n\n`;
    bodyText += `--- 5. ማጠቃለያ (SUMMARY) ---\n${results.longSummary}\n\n`;
    bodyText += `--- 6. የማህበራዊ ሚዲያ (SOCIAL POSTS) ---\nFacebook:\n${results.facebookPost}\n\nTelegram:\n${results.telegramPost}\n\n`;
    bodyText += `--- 7. ርዕሶችና ቁልፍ ቃላት (TITLES & SEO) ---\nTitles:\n${results.youtubeTitles.join("\n")}\n\nKeywords:\n${results.seoKeywords.join(", ")}\n\nHashtags:\n${results.hashtags.map(h => `#${h}`).join(" ")}`;

    try {
      const response = await fetch("/api/drive/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          filename: exportTitle,
          content: bodyText,
          asDoc: exportAsDoc
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "ለማስቀመጥ አልተቻለም።");
      }

      setDriveSuccess({ fileId: data.data.fileId, name: data.data.name });
    } catch (err: any) {
      setDriveError(err.message || "ወደ ጎግል ድራይቭ ለመላክ አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
    } finally {
      setDriveSaving(false);
    }
  };

  // Sections definitions under active categories
  const getSectionsToDisplay = () => {
    switch (activeCategory) {
      case "news":
        return [
          { id: "transcript", label: "ሙሉ የአማርኛ ትርጉም (Full Transcript)", content: results.transcript },
          { id: "speakers", label: "የተናጋሪዎች ማንነት (Speaker Identification)", content: results.speakers },
          { id: "timestamped", label: "በጊዜ ገደብ የተከፋፈለ ትርጉም (Timestamped Transcript)", content: results.timestampedTranscript },
          { id: "article", label: "ጋዜጣዊ መግለጫ / ሪፖርት (Professional News Article)", content: results.newsArticle },
          { id: "breaking", label: "የሰበር ዜና ስሪት (Breaking News Version)", content: results.breakingNews }
        ];
      case "summaries":
        return [
          { id: "short", label: "አጭር ማጠቃለያ (Short Summary)", content: results.shortSummary },
          { id: "long", label: "ዝርዝር ማጠቃለያ (Long Summary)", content: results.longSummary }
        ];
      case "social":
        return [
          { id: "facebook", label: "የፌስቡክ ጽሑፍ (Facebook Post)", content: results.facebookPost },
          { id: "telegram", label: "የቴሌግራም ጽሑፍ (Telegram Post)", content: results.telegramPost }
        ];
      case "youtube":
        return [
          { id: "description", label: "የዩቲዩብ ማብራሪያ (YouTube Description)", content: results.youtubeDescription },
          { id: "titles", label: "20 የዩቲዩብ ርዕሶች (20 YouTube Titles)", content: results.youtubeTitles.map((t, i) => `${i + 1}. ${t}`).join("\n") },
          { id: "thumbnails", label: "20 የታምብኔል ጽሑፎች (20 Thumbnail Ideas)", content: results.thumbnailIdeas.map((t, i) => `${i + 1}. ${t}`).join("\n") },
          { id: "seo", label: "30 ታዋቂ የፍለጋ ቁልፍ ቃላት (30 SEO Keywords)", content: results.seoKeywords.join("\n") },
          { id: "hashtags", label: "20 ሃሽታጎች (20 Hashtags)", content: results.hashtags.map(h => `#${h}`).join(" ") }
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Mock mode/Quota fallback banner alert */}
      {isMock && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-start space-x-3">
          <span className="text-base shrink-0">⚠️</span>
          <div>
            <p className="font-bold mb-0.5">የሙከራ ሁነታ ረቂቅ (Demo/Quota Fallback Mode)</p>
            <p className="leading-relaxed text-[11px] opacity-90">
              የጀሚኒ AI የነፃ አጠቃቀም ገደብ (Quota) በመጠናቀቁ የተነሳ ይህ ቪዲዮ በሙከራ ሁነታ ተተንትኗል። ሁሉንም 14 የይዘት አይነቶች፣ ኮፒ ማድረግና ወደ Google Drive መላክ መሞከር ይችላሉ!
            </p>
          </div>
        </div>
      )}
      
      {/* Overview Card & Export All */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 dark:border-emerald-500/10">
        <div className="flex items-center space-x-4 mb-4 md:mb-0">
          <img 
            src={metadata.thumbnail} 
            alt={metadata.title}
            className="w-24 h-16 rounded-lg object-cover border border-emerald-500/20 shadow-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400";
            }}
          />
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white line-clamp-1">{metadata.title}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">ፈጣሪ፦ {metadata.author}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={downloadEntirePackage}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm transition-colors cursor-pointer text-sm"
          >
            <Download className="h-4 w-4" />
            <span>ሙሉ ሪፖርት አውርድ (.txt)</span>
          </button>

          {accessToken && (
            <button
              onClick={() => {
                setShowDriveModal(true);
                setDriveSuccess(null);
                setDriveError(null);
              }}
              className="flex items-center justify-center space-x-2 px-4 py-2 border border-emerald-600 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-medium rounded-xl transition-colors cursor-pointer text-sm"
              title="Save to Google Drive"
            >
              <Chrome className="h-4 w-4" />
              <span className="hidden sm:inline">ወደ Google Drive ላክ</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Categories Navigation */}
      <div className="flex space-x-2 overflow-x-auto pb-2 border-b border-gray-100 dark:border-slate-800 scrollbar-none">
        {categories.map((cat) => {
          const IconComp = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "bg-gray-50 dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              <IconComp className="h-4 w-4" />
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>

      {/* Structured Category Content */}
      <div className="space-y-6">
        {activeCategory === "studio" ? (
          <VideoStudio results={results} metadata={metadata} />
        ) : (
          getSectionsToDisplay().map((sec) => (
            <div 
              key={sec.id}
              className="bg-white dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
            >
              {/* Header Toolbar */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50/50 dark:bg-slate-800/40 border-b border-gray-100 dark:border-slate-800">
                <h5 className="font-bold text-sm text-gray-900 dark:text-white flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{sec.label}</span>
                </h5>

                {/* Toolbar Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCopy(sec.content, sec.id)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Copy to Clipboard"
                  >
                    {copiedSection === sec.id ? (
                      <Check className="h-4 w-4 text-emerald-500 animate-bounce" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => downloadTxt(sec.label, sec.content)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Export as Plain Text (.txt)"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => downloadDoc(sec.label, sec.content)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Export as Microsoft Word (.doc)"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => downloadPdf(sec.label, sec.content)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Export as PDF (.pdf)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </button>
                </div>
              </div>

              {/* Display Box */}
              <div className="p-6">
                <p className="text-gray-700 dark:text-gray-300 font-sans text-sm leading-relaxed whitespace-pre-wrap select-text">
                  {sec.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Google Drive Upload Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              ወደ Google Drive አስቀምጥ (Save to Google Drive)
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                  የፋይል ስም (File Name)
                </label>
                <input
                  type="text"
                  value={exportTitle}
                  onChange={(e) => setExportTitle(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Format Select */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">የጎግል ዶክመንት አድርግ (Convert to Google Doc)</h4>
                  <p className="text-[11px] text-gray-500">እንደ ዶክመንት አድርጎ ድራይቭዎ ላይ ያስቀምጠዋል</p>
                </div>
                <input
                  type="checkbox"
                  checked={exportAsDoc}
                  onChange={(e) => setExportAsDoc(e.target.checked)}
                  className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              {/* Status Section */}
              {driveSaving && (
                <div className="flex items-center space-x-3 text-sm text-emerald-600 dark:text-emerald-400">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>ዘገባውን ወደ ጎግል ድራይቭ በመላክ ላይ...</span>
                </div>
              )}

              {driveSuccess && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-start space-x-3 text-sm">
                  <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">በስኬት ተቀምጧል!</span>
                    <span className="block text-xs mb-2">ፋይል፦ {driveSuccess.name}</span>
                    <a
                      href={`https://docs.google.com/document/d/${driveSuccess.fileId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 font-bold text-emerald-600 hover:text-emerald-700 underline text-xs cursor-pointer"
                    >
                      <span>በGoogle Docs ክፈት</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {driveError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-xs">
                  {driveError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowDriveModal(false)}
                disabled={driveSaving}
                className="px-4 py-2 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-700 dark:text-gray-300 font-medium text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                ዝጋ (Close)
              </button>
              
              {!driveSuccess && (
                <button
                  onClick={handleSaveToDrive}
                  disabled={driveSaving || !exportTitle}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm cursor-pointer shadow-sm transition-colors"
                >
                  {driveSaving ? "በማስቀመጥ ላይ..." : "አስቀምጥ (Save)"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
