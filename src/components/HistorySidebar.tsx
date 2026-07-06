import React, { useState } from "react";
import { Trash2, Search, Calendar, Play, ChevronRight, BookOpen } from "lucide-react";
import { SavedAnalysis } from "../types";

interface HistorySidebarProps {
  historyList: SavedAnalysis[];
  onSelect: (analysis: SavedAnalysis) => void;
  onDelete: (id: string) => void;
  activeId?: string;
}

export default function HistorySidebar({ historyList, onSelect, onDelete, activeId }: HistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredHistory = historyList.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm h-full flex flex-col">
      
      {/* Search Header */}
      <div className="mb-4">
        <h4 className="font-sans font-bold text-gray-900 dark:text-white text-base mb-1">
          ያለፉ የዜና ዘገባዎች
        </h4>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-3">
          የተቀመጡ ትንተናዎች ታሪክ (Saved Analyses History)
        </p>
        
        <div className="relative">
          <input
            type="text"
            placeholder="ርዕስ ፈልግ (Search by title...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[480px] pr-1">
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-700 mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
              ምንም የተቀመጡ ታሪኮች የሉም
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              በቀኝ በኩል አዲስ ዩቲዩብ ቪዲዮ በማስገባት አዲስ ትንተና መጀመር ይችላሉ።
            </p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const isActive = activeId === item.id;
            return (
              <div
                key={item.id}
                className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-gray-50/50 dark:bg-slate-900/40 border-gray-100 dark:border-slate-800 hover:border-emerald-500/20 hover:bg-emerald-500/[0.02]"
                }`}
                onClick={() => onSelect(item)}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  {/* Thumbnail Preview */}
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-12 h-9 rounded object-cover border border-gray-200 dark:border-slate-800 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=100";
                    }}
                  />
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-gray-900 dark:text-white truncate group-hover:text-emerald-500 transition-colors">
                      {item.title}
                    </h5>
                    
                    <div className="flex items-center space-x-2 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3 text-gray-400 shrink-0" />
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                    title="Delete saved report"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
