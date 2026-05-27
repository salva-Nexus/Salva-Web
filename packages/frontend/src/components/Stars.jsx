// Stars.jsx
import React from 'react';
import { motion } from 'framer-motion';

const Stars = () => {
  const stars = [...Array(40)]; // Generate 40 stars
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {stars.map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-[2px] h-[2px] bg-salvaGold rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 2 + Math.random() * 3,
            repeat: Infinity,
            delay: Math.random() * 5,
          }}
        />
      ))}
    </div>
  );
};

export default Stars;
