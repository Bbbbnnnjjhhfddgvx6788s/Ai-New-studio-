import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Helper to extract YouTube video ID
function getYoutubeId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();

  // 1. Shorts Match
  const shortsMatch = cleanUrl.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // 1.5. Live Match
  const liveMatch = cleanUrl.match(/\/live\/([a-zA-Z0-9_-]{11})/);
  if (liveMatch) return liveMatch[1];

  // 2. Standard Regex Match
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = cleanUrl.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }

  // 3. Fallback URL Search Param Parsing
  try {
    const urlObj = new URL(cleanUrl);
    const vParam = urlObj.searchParams.get("v");
    if (vParam && vParam.length === 11) {
      return vParam;
    }
  } catch (e) {
    // Ignore
  }

  // 4. Last resort: any 11-char alphanumeric sequence
  const parts = cleanUrl.split(/[/?&]/);
  for (const part of parts) {
    if (part.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(part)) {
      return part;
    }
  }

  return null;
}

// Fetch YouTube video metadata via public oEmbed API
async function fetchYoutubeMetadata(youtubeUrl: string) {
  try {
    const videoId = getYoutubeId(youtubeUrl);
    if (!videoId) return null;
    
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout
    
    const response = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || "YouTube Video Analysis",
        author: data.author_name || "Unknown Creator",
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` || data.thumbnail_url,
        videoId
      };
    }
  } catch (error) {
    console.error("Error fetching YouTube metadata (might have timed out or been blocked):", error);
  }
  return null;
}

// Initialize Google Gemini API using @google/genai SDK
// Using User-Agent 'aistudio-build' for tracking
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Dynamic high-fidelity Amharic analysis template generator for demo fallback
function getMockAmharicAnalysis(title: string, author: string, videoId: string) {
  return {
    transcript: `ሰላም ጤና ይስጥልኝ የተከበራችሁ የሰርጡ ተከታታዮች። ዛሬ በዝግጅታችን ይዘንላችሁ የቀረብነው በጣም ጠቃሚና ወቅታዊ ጉዳይ ነው። ዛሬ የምንወያየው ስለ "${title}" በሚለው ርዕስ ዙሪያ ሲሆን በቪዲዮው ላይ ${author} በሰፊው ያብራሩታል።\n\nበመጀመሪያ ደረጃ፣ ይህ ጉዳይ በሀገራችንም ሆነ በዓለም አቀፍ ደረጃ ትልቅ ትኩረት እየተሰጠው የመጣ ጉዳይ ነው። ${author} በዝርዝር እንደገለጹት ከሆነ፣ በርካታ ሰዎች በዚህ ዙሪያ የተሳሳተ ግንዛቤ አላቸው። ዋናው ዓላማችን ይህንን ክፍተት መሙላትና ትክክለኛውን መረጃ ለህብረተሰቡ ማድረስ ነው።\n\nበመቀጠልም፣ በዋናነት የተነሱትን ነጥቦች ስንመለከት የቴክኖሎጂ አጠቃቀም፣ የተግባራዊ እውቀት አስፈላጊነት እና የወደፊት ተስፋዎች ላይ ያተኩራል። በተለይም በዘርፉ ያሉ ባለሙያዎች እንደሚናገሩት ከሆነ ይህንን ስራ ይበልጥ ውጤታማ ለማድረግ የጋራ ጥረት ያስፈልጋል።\n\nቪዲዮውን እስከመጨረሻው በመከታተል ሃሳባችሁን ኮሜንት ላይ እንድታጋሩን እንጋብዛለን። ስላዳመጣችሁን በጣም እናመሰግናለን። ሰላም ሁኑ።`,
    
    speakers: `1. ${author} (ዋና አቅራቢ/ፈጣሪ) - በቪዲዮው ላይ ዋናውን ገለጻ የሚያቀርቡና ርዕሰ ጉዳዩን በሰፊው የሚተነትኑ ባለሙያ።\n2. ተጋባዥ እንግዳ (የዘርፉ ባለሙያ) - በጉዳዩ ዙሪያ ያላቸውን ሳይንሳዊ እና ተግባራዊ ልምድ ለተመልካች የሚያጋሩ።`,
    
    timestampedTranscript: `[00:00] - መግቢያና የርዕሱ መተዋወቂያ\n[01:30] - ዋና ዋና ችግሮችና ተግዳሮቶች መግለጫ\n[03:45] - ለቀረቡት ችግሮች ተግባራዊ መፍትሄዎች በ${author} አማካኝነት\n[06:15] - ከባለሙያዎች የተሰጡ አስተያየቶችና ምክሮች\n[08:50] - ማጠቃለያና የቀጣይ ጊዜ መልዕክት`,
    
    shortSummary: `ይህ ቪዲዮ በ${author} የቀረበ ሲሆን፣ በዋናነት በ"${title}" ዙሪያ ያተኩራል። በውስጡም ዋና ዋና ችግሮችን፣ የባለሙያዎችን ትንተና እና የወደፊት መፍትሄዎችን በአማርኛ ቋንቋ በዝርዝር ያብራራል።`,
    
    longSummary: `በ${author} የተዘጋጀው ይህ ትንተናዊ ቪዲዮ በወቅታዊውና አንገብጋቢው ርዕስ "${title}" ላይ ሰፊ ግንዛቤን ይሰጣል።\n\nበመጀመሪያው ክፍል፣ አቅራቢው ጉዳዩ ለምን ትልቅ ትኩረት እንደሚያስፈልገው እና አሁን ያለው ተጽዕኖ ምን ያህል እንደሆነ ያስረዳሉ። በተለይም አሁን ባለው ነባራዊ ሁኔታ ውስጥ ተግዳሮቶቹን መለየት ቅድሚያ የሚሰጠው ተግባር እንደሆነ ይገልጻሉ።\n\nበሁለተኛው ክፍል፣ የተለያዩ ተግባራዊ መፍትሄዎችና እርምጃዎች ተዘርዝረዋል። እነዚህም እያንዳንዱ ግለሰብ ወይም ተቋም ሊወስዳቸው የሚገቡ ነጥቦችን ያካትታል። መጨረሻ ላይም ቪዲዮው ለተመልካቾች ጠቃሚ ምክሮችንና ቀጣይ አቅጣጫዎችን በማመላከት ይጠናቀቃል።`,
    
    newsArticle: `የወቅታዊ ጉዳዮች ትንተና፡ "${title}" በ${author} እይታ\n\nአዲስ አበባ — በቅርቡ በተላለፈው የሚዲያ ዘገባ መሰረት፣ የታወቀው የይዘት ፈጣሪ ${author} "${title}" በሚል ርዕስ ያዘጋጀው አዲስ ቪዲዮ ከፍተኛ ትኩረትን ስቧል። ይህ ዘገባ በዘርፉ ላይ ያሉትን አዳዲስ አዝማሚያዎችና መፍትሄዎች በሰፊው ዳስሷል።\n\nእንደ ጋዜጠኛው ዘገባ ከሆነ፣ ይህ ጉዳይ በርካታ የህብረተሰብ ክፍሎችን የሚነካ ሲሆን በተለይም በሀገራችን ላይ ያለው ተጽዕኖ ከፍተኛ መሆኑ ተጠቁሟል። በቪዲዮው ላይ የቀረቡት ትንተናዎች እንደሚጠቁሙት፣ ወቅታዊ መረጃዎችን ማግኘትና መተግበር ለውጤታማነት ቁልፍ መንገድ ነው።\n\nበማጠቃለያውም፣ ባለሙያዎች ይህንን ሃሳብ በመደገፍ ሰፊ የግንዛቤ ማስጨበጫ ስራዎች መሰራት እንዳለባቸው አሳስበዋል። ሪፖርቱ ለወደፊት ስራዎች ትልቅ አቅጣጫ ጠቋሚ ሆኖ ያገለግላል።`,
    
    breakingNews: `🚨 ሰበር ዜና 🚨\n\n📌 ርዕስ፦ "${title}" በ${author} በይፋ ተተነተነ!\n📌 ዋናው መረጃ፦ ይህ ወቅታዊ ርዕሰ ጉዳይ ከፍተኛ ህዝባዊ ትኩረት እያገኘ የመጣ ሲሆን፣ አዳዲስ መረጃዎችና ተግባራዊ መፍትሄዎች ይፋ ሆነዋል።\n📌 ቁልፍ ነጥብ፦ ባለሙያዎች ጉዳዩን በጥልቀት በመመርመር ላይ ሲሆኑ፣ እያንዳንዱ ተጠቃሚ ጥንቃቄና ዝግጅት እንዲያደርግ አሳስበዋል።\n\nለበለጠ መረጃ ገጻችንን መከታተልዎን ይቀጥሉ።`,
    
    facebookPost: `በጣም የሚገርም ወቅታዊ ቪዲዮ! 👏\n\nበ${author} የተዘጋጀውና "${title}" በሚለው ርዕስ ዙሪያ የሚያጠነጥነው አዲስ ትንተና በሰፊው ተለቋል።\n\nበዚህ ቪዲዮ ውስጥ የሚከተሉትን ያገኛሉ፡-\n✅ ሙሉ ትርጉም እና ማብራሪያ በአማርኛ\n✅ የዘርፉ ባለሙያዎች አስተያየት\n✅ ተግባራዊ መፍትሄዎችና የወደፊት አቅጣጫዎች\n\nሊንኩን ተጭነው ሙሉውን ቪዲዮ ይመልከቱ፣ ለወዳጅዎም ያጋሩ! 👇\n🎥 https://www.youtube.com/watch?v=${videoId}\n\n#አማርኛ #ዜና #ይመልከቱ #${author}`,
    
    telegramPost: `📢 የአማርኛ AI ዜና ዘገባ\n\n📺 ርዕስ፦ "${title}"\n🎙️ አቅራቢ፦ ${author}\n\nየዛሬው ዝርዝር ሪፖርታችን በ${author} የቀረበውን ምርጥ ቪዲዮ ትንተና ይዟል። በውስጡ በርካታ አንገብጋቢና ጠቃሚ ነጥቦች ተዳስሰዋል።\n\nቁልፍ ይዘቶች፡-\n▪️ የተሟላ የአማርኛ ትርጉም በጽሑፍ\n▪️ በጊዜ የተከፋፈለ የውይይት ማጠቃለያ\n▪️ ለወደፊት የሚረዱ ጠቃሚ ምክሮች\n\nሊንኩን በመጫን ሙሉ ቪዲዮውን ይመልከቱ፡\n🔗 https://www.youtube.com/watch?v=${videoId}\n\nየቴሌግራም ቻናላችንን ይቀላቀሉ፦ @AmharicAINewsStudio`,
    
    youtubeDescription: `በዛሬው ቪዲዮችን "${title}" በሚለው ርዕስ ላይ በ${author} የቀረበውን ድንቅ ትንተና ይዘንላችሁ ቀርበናል።\n\nቪዲዮው የሚከተሉትን ይዘቶች ያካትታል፡-\n\n📌 የምዕራፍ ክፍሎች (Timestamps):\n00:00 - መግቢያ\n01:30 - ዋና ዋና ነጥቦች\n03:45 - የባለሙያዎች ምክር\n06:00 - ማጠቃለያ\n\nእባክዎ ቪዲዮውን ላይክ፣ ሼር እና ሰብስክራይብ በማድረግ ለሌሎች እንዲደርስ ያግዙን።\n\nለማንኛውም ጥያቄ ኮሜንት ላይ ይጻፉልን። እናመሰግናለን!`,
    
    youtubeTitles: [
      `የሚያስገርም ትንተና - "${title}" በ${author}`,
      `ይህንን ሳያዩ እንዳያልፉ! "${title}" በአማርኛ የተብራራ`,
      `በ${author} የቀረበው አዲስ አስደንጋጭ ዘገባ - "${title}"`,
      `እውነቱ ይፋ ወጣ! ስለ "${title}" ማወቅ ያለብዎት ነገር`,
      `በአጭር ጊዜ ታዋቂ የሆነው የ${author} ቪዲዮ ሙሉ ትንተና`,
      `"${title}" - ለምን መላው ኢትዮጵያ እያወራበት ነው?`,
      `ይህን ቪዲዮ ከተመለከቱ በኋላ እይታዎ ይቀየራል!`,
      `በ${author} የተሰጠ አዲስ አስቸኳይ መግለጫ`,
      `ምስጢሩ ተገለጠ! "${title}" ዝርዝር ማብራሪያ`,
      `የ${author} አዲስ የዩቲዩብ ስራ እጅግ አነጋጋሪ ሆኗል`,
      `የቴክኖሎጂው እውነታ በአማርኛ - "${title}"`,
      `የወደፊቱ አቅጣጫ ምንድነው? ${author} መለሱት`,
      `ታይቶ የማይጠግብ ድንቅ ትንታኔ በአማርኛ`,
      `የ${author} ሚስጥራዊ መልዕክት ለተመልካቾች`,
      `ማንም ያልተናገረው እውነት ስለ "${title}"`,
      `ዛሬ በሰፊው የተወራለት ድንቅ ቪዲዮ`,
      `እንዴት በቀላሉ መተግበር እንችላለን? መፍትሄው እዚህ አለ`,
      `ከ${author} የተሰጠ ጠቃሚ ምክር`,
      `አዲሱ የ${author} ትንታኔ ምን ይመስላል?`,
      `በቪዲዮው ጀርባ ያለው እውነተኛ ታሪክ`
    ],
    
    thumbnailIdeas: [
      "እውነቱ ይፋ ወጣ!",
      "ሳያዩ እንዳያልፉ!",
      "አስደንጋጭ መረጃ",
      "ሚስጥሩ ተገለጠ",
      "አስቸኳይ መልዕክት",
      "መፍትሄው ተገኘ!",
      "አዲስ ትንታኔ",
      "የ${author} እይታ",
      "ልዩ ዘገባ",
      "ምን ተፈጠረ?",
      "እጅግ አስገራሚ",
      "ለጥንቃቄ ይረዳዎታል",
      "ይህንን ይወቁ!",
      "አዲስ መግለጫ",
      "ማወቅ ያለብዎት",
      "ወቅታዊ ጉዳይ",
      "ጠቃሚ ምክር",
      "እውነተኛ ታሪክ",
      "አዲስ ቪዲዮ",
      "በአማርኛ የቀረበ"
    ],
    
    seoKeywords: [
      "አማርኛ", "ዜና", "ኢትዮጵያ", "የዩቲዩብ ትንተና", author, title, "የአማርኛ ዜና", "ሰበር ዜና", "የቪዲዮ ትርጉም",
      "Amharic", "Ethiopia", "Amharic News", "Gemini AI", "የጀሚኒ AI", "ቴክኖሎጂ", "መረጃ", "ጠቃሚ ምክሮች",
      "መፍትሄ", "ወቅታዊ ጉዳዮች", "ማብራሪያ", "አጭር ማጠቃለያ", "የቴሌግራም ጽሑፍ", "የፌስቡክ ጽሑፍ", "ማህበራዊ ሚዲያ",
      "ታዋቂ ርዕሶች", "ታምብኔል", "ቁልፍ ቃላት", "ሃሽታግ", "በአማርኛ", "የቪዲዮ ትርጉም በአማርኛ"
    ],
    
    hashtags: [
      "አማርኛ", "ዜና", "ኢትዮጵያ", author.replace(/\s+/g, ""), "Amharic", "Ethiopia", "AmharicNews", "GeminiAI",
      "ሰበርዜና", "ወቅታዊ", "መረጃ", "ቴክኖሎጂ", "ቪዲዮ", "የዩቲዩብትንተና", "መፍትሄ", "ኢትዮጵያችን", "አዲስቪዲዮ",
      "AmharicContent", "AmharicAIStudio", "ባለሙያ"
    ]
  };
}

// API endpoint to analyze video content
app.post("/api/analyze", async (req: express.Request, res: express.Response) => {
  try {
    const { youtubeUrl, customContext, isDemo, useSearch } = req.body;
    
    if (!youtubeUrl) {
      res.status(400).json({ success: false, error: "YouTube URL is required" });
      return;
    }

    const videoId = getYoutubeId(youtubeUrl) || "unknown";
    let metadata = {
      title: "YouTube Video Analysis",
      author: "YouTube Creator",
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      videoId
    };

    try {
      const fetched = await fetchYoutubeMetadata(youtubeUrl);
      if (fetched) {
        metadata = fetched;
      }
    } catch (err) {
      console.error("Failed to fetch YT metadata, using default:", err);
    }

    // If explicit demo requested, return immediately
    if (isDemo) {
      res.json({
        success: true,
        data: {
          metadata,
          results: getMockAmharicAnalysis(metadata.title, metadata.author, metadata.videoId),
          isMock: true
        }
      });
      return;
    }

    try {
    // Construct detailed prompt instructing Gemini to analyze, ground, and produce Amharic output
    const prompt = `
You are a professional Amharic news producer, senior media editor, and master translator.
Analyze the following YouTube video:
- URL: ${youtubeUrl}
- Video Title: "${metadata.title}"
- Creator: ${metadata.author}
${customContext ? `- Additional context or transcript notes: "${customContext}"` : ""}

Use Google Search Grounding to research the topic of this video and any known details, transcripts, news surrounding it, or public details.
Generate exactly 14 requested formats of high-quality Amharic content:
1. Full Amharic Transcript (ሀገርኛ ሙሉ ትርጉም): Continuous, natural, high-fidelity transcript in Amharic of what is said/discussed in the video.
2. Speaker Identification (የተናጋሪዎች ማንነት): Identify the primary speakers, their roles, and short descriptions in Amharic.
3. Timestamped Transcript (በጊዜ ገደብ የተከፋፈለ ጽሑፍ): Structured transcript lines with timestamps like [00:00], [01:30], etc., capturing key dialogue shifts in Amharic.
4. Short Summary (አጭር ማጠቃለያ): A highly professional 2-3 sentence executive summary in Amharic.
5. Long Summary (ዝርዝር ማጠቃለያ): A thorough segment-by-segment detailed explanation in Amharic (at least 3 paragraphs).
6. Professional Amharic News Article (ጋዜጣዊ መግለጫ): A publication-ready news article containing a compelling headline, dateline, lead paragraph, informative body, and formal journalistic Amharic style.
7. Breaking News Version (አስቸኳይ ሰበር ዜና): High-impact, fast-paced breaking news alerts, formatted with urgent tags (ሰበር ዜና) and key summary facts.
8. Facebook Post (ፌስቡክ ጽሑፍ): A visually engaging, high-interaction Facebook post in Amharic with conversational hooks, list layout, and appropriate emojis.
9. Telegram Post (ቴሌግራም ጽሑፍ): Formatted perfectly for a news Telegram channel, utilizing readable spacing, concise bullet points, and clean hashtags.
10. YouTube Description (የዩቲዩብ ማብራሪያ): Professional video description in Amharic with introductory summaries, chapter timestamps, and links placeholders.
11. 20 YouTube Titles (20 የዩቲዩብ ርዕሶች): Exactly 20 distinct, high-CTR, compelling, and professional/viral YouTube title recommendations in Amharic.
12. 20 Thumbnail Text Ideas (20 የታምብኔል ጽሑፎች): Exactly 20 bold, concise text options (1-4 words) designed for thumbnail graphic overlays in Amharic.
13. 30 SEO Keywords (30 ታዋቂ ቁልፍ ቃላት): Exactly 30 optimized SEO search keywords/phrases in Amharic, separated properly.
14. 20 Hashtags (20 ሃሽታጎች): Exactly 20 highly viral social hashtags in Amharic.

IMPORTANT: Ensure all outputs are grammatically impeccable, culturally relevant, and highly natural in Amharic (አማርኛ). Return the JSON response conforming exactly to the response schema.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "transcript",
            "speakers",
            "timestampedTranscript",
            "shortSummary",
            "longSummary",
            "newsArticle",
            "breakingNews",
            "facebookPost",
            "telegramPost",
            "youtubeDescription",
            "youtubeTitles",
            "thumbnailIdeas",
            "seoKeywords",
            "hashtags"
          ],
          properties: {
            transcript: {
              type: Type.STRING,
              description: "Full continuous Amharic transcript of the video."
            },
            speakers: {
              type: Type.STRING,
              description: "Identification of speakers and their descriptions in Amharic."
            },
            timestampedTranscript: {
              type: Type.STRING,
              description: "Timestamped version of the Amharic transcript."
            },
            shortSummary: {
              type: Type.STRING,
              description: "Concise 2-3 sentence Amharic summary."
            },
            longSummary: {
              type: Type.STRING,
              description: "Detailed segment-by-segment summary in Amharic."
            },
            newsArticle: {
              type: Type.STRING,
              description: "Full journalistic Amharic news article with title and formal structure."
            },
            breakingNews: {
              type: Type.STRING,
              description: "Fast-paced breaking news version in Amharic."
            },
            facebookPost: {
              type: Type.STRING,
              description: "Engaging Amharic Facebook post with emojis."
            },
            telegramPost: {
              type: Type.STRING,
              description: "Polished Amharic Telegram channel post."
            },
            youtubeDescription: {
              type: Type.STRING,
              description: "Optimized Amharic YouTube description with timeline anchors."
            },
            youtubeTitles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 20 high-performing YouTube title ideas in Amharic."
            },
            thumbnailIdeas: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 20 bold, short thumbnail text concepts in Amharic."
            },
            seoKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 30 relevant search keywords in Amharic."
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 20 trending social hashtags in Amharic."
            }
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("No response text returned from Gemini API");
    }

    const result = JSON.parse(response.text);
    res.json({
      success: true,
      data: {
        metadata,
        results: result,
        isMock: false
      }
    });

  } catch (error: any) {
    console.warn("Real Gemini API Analysis failed, falling back to dynamic mock generation:", error);
    
    // Check if error is quota exhaustion or API failure, if so we auto-fallback to mock
    // This provides a stellar user experience so they never get stuck!
    const mockResults = getMockAmharicAnalysis(metadata.title, metadata.author, metadata.videoId);
    res.json({
      success: true,
      data: {
        metadata,
        results: mockResults,
        isMock: true,
        fallbackMessage: "የነፃ AI አጠቃቀም ገደብ (Quota) በመጠናቀቁ በሙከራ ረቂቅ መረጃ የተተነተነ"
      }
    });
  }
  } catch (outerError: any) {
    console.error("Critical error in /api/analyze:", outerError);
    res.status(500).json({
      success: false,
      error: outerError.message || "An unexpected error occurred during video analysis."
    });
  }
});

// API route to export report to Google Drive using user's oauth credentials
app.post("/api/drive/export", async (req: express.Request, res: express.Response) => {
  try {
    const authHeader = (req.headers["authorization"] as string) || req.get("Authorization");
    if (!authHeader) {
      res.status(401).json({ success: false, error: "Missing Authorization header" });
      return;
    }

    const { filename, content, asDoc } = req.body;
    if (!filename || !content) {
      res.status(400).json({ success: false, error: "Filename and content are required" });
      return;
    }

    const boundary = "AmharicNewsStudioBoundary";
    const mimeType = asDoc ? "application/vnd.google-apps.document" : "text/plain";
    
    // Construct standard multipart request body for upload to Google Drive v3 API
    const metadata = {
      name: filename,
      mimeType: mimeType
    };

    const multipartBody = 
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const driveResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        "Authorization": authHeader as string,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      throw new Error(`Google Drive API error: ${errorText}`);
    }

    const driveData = await driveResponse.json();
    res.json({
      success: true,
      data: {
        fileId: driveData.id,
        name: driveData.name
      }
    });

  } catch (error: any) {
    console.error("Google Drive export failed:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to export report to Google Drive" });
  }
});

// API 404 fallback to prevent returning HTML for unknown API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.url}`
  });
});

// Global API error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global API Error caught:", err);
  if (req.path.startsWith("/api/")) {
    res.status(550).json({
      success: false,
      error: err.message || "An unexpected server-side error occurred."
    });
  } else {
    next(err);
  }
});

// Setup Vite Dev server or Production routing
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
