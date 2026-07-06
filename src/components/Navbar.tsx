import React from "react";
import { User } from "firebase/auth";
import { Sun, Moon, LogOut, Video, Newspaper } from "lucide-react";

interface NavbarProps {
  user: User | null;
  isDark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
}

export default function Navbar({ user, isDark, toggleTheme, onLogout }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/10">
              <Newspaper className="h-5 w-5" />
            </div>
            <div>
              <span className="font-sans font-bold tracking-tight text-lg text-gray-900 dark:text-white block leading-none">
                Amharic AI News Studio
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium tracking-wide">
                የአማርኛ የዜና ስቱዲዮ
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-4">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors duration-200 cursor-pointer"
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Authenticated User Status */}
            {user && (
              <div className="flex items-center space-x-3 border-l border-gray-200 dark:border-slate-800 pl-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold text-gray-900 dark:text-white max-w-[120px] truncate">
                    {user.displayName || "አባል"}
                  </span>
                  <span className="text-[10px] text-gray-500 max-w-[120px] truncate">
                    {user.email}
                  </span>
                </div>
                
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User Profile"}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border border-emerald-500 object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-sm border border-emerald-600">
                    {(user.email || "A").substring(0, 1).toUpperCase()}
                  </div>
                )}

                <button
                  onClick={onLogout}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors duration-200 cursor-pointer"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}
