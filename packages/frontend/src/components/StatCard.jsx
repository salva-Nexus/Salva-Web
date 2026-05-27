// StatCard.jsx - FIXED: Responsive
import React from 'react';
import { motion } from 'framer-motion';

const StatCard = ({ label, value, icon, color = 'salvaGold' }) => {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      className="p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-white/5 bg-white/[0.03] backdrop-blur-xl flex flex-col gap-3 sm:gap-4 w-full"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/40 font-medium">
          {label}
        </span>
        <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-${color}/10 text-${color}`}>
          {React.cloneElement(icon, { size: window.innerWidth < 640 ? 16 : 20 })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-all">
          {value}
        </h3>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full bg-${color} animate-pulse`} />
          <span className="text-[9px] sm:text-[10px] text-white/20 uppercase tracking-widest font-bold">
            Live Data
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;
