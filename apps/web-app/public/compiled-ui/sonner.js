import React, { useEffect, useState } from 'react';

"use client";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { Toaster as Sonner } from "sonner";
const getRootTheme = /* @__PURE__ */ __name(() => {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}, "getRootTheme");
const useLocalTheme = /* @__PURE__ */ __name(() => {
  const [theme, setTheme] = useState(getRootTheme);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateTheme = () => setTheme(getRootTheme());
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", updateTheme);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateTheme);
    };
  }, []);
  return { theme };
}, "useLocalTheme");
const Toaster = /* @__PURE__ */ __name(({ ...props }) => {
  const { theme } = useLocalTheme();
  return /* @__PURE__ */ React.createElement(
    Sonner,
    {
      theme,
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    }
  );
}, "Toaster");
export { Toaster };
