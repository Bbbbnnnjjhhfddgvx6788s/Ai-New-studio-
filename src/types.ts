export interface AnalysisResults {
  transcript: string;
  speakers: string;
  timestampedTranscript: string;
  shortSummary: string;
  longSummary: string;
  newsArticle: string;
  breakingNews: string;
  facebookPost: string;
  telegramPost: string;
  youtubeDescription: string;
  youtubeTitles: string[];
  thumbnailIdeas: string[];
  seoKeywords: string[];
  hashtags: string[];
}

export interface VideoMetadata {
  title: string;
  author: string;
  thumbnail: string;
  videoId: string;
}

export interface SavedAnalysis {
  id: string;
  userId: string;
  url: string;
  title: string;
  author: string;
  thumbnail: string;
  videoId: string;
  createdAt: string; // ISO string
  results: AnalysisResults;
  isMock?: boolean;
}
