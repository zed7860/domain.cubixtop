"use client";
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
type Theme = 'light' | 'dark';
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); }, []);
  function change() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem('cubixtop-theme', next); } catch { /* Theme still works when storage is unavailable. */ }
  }
  const label = `Switch to ${theme === 'dark' ? 'day' : 'night'} mode`;
  return <button className="theme-toggle" type="button" onClick={change} aria-label={label} title={label}>{theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}</button>;
}
