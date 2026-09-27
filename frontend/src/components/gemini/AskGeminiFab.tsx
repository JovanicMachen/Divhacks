"use client";

import { motion } from "framer-motion";

import { GeminiSparkle } from "./GeminiSparkle";

/** Phone control. On a wide screen Ask Gemini is the column beside the map. */
export function AskGeminiFab({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Ask Gemini"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="absolute bottom-[114px] right-4 z-20 flex h-12 items-center gap-2 rounded-full px-4 text-[15px] font-bold text-white shadow-[0_8px_20px_rgb(109_40_217_/_0.28)] tablet:hidden"
      style={{ background: "linear-gradient(135deg, #4B8BFF 0%, #7C5CFF 48%, #C084FC 100%)" }}
    >
      <GeminiSparkle size={17} />
      Ask Gemini
    </motion.button>
  );
}
