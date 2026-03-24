// packages/frontend/src/components/FloatingCoin.jsx
import { motion } from 'framer-motion';
// Import the actual file so Webpack handles it
import ngnCoin from '../assets/ngn-coin.png'; 

const FloatingCoin = ({ delay, x, y, size, blur }) => (
  <motion.img
    src={ngnCoin} // Use the imported variable here
    className={`absolute pointer-events-none opacity-60 ${blur}`}
    style={{ left: x, top: y, width: size }}
    animate={{
      y: [0, -40, 0], 
      rotate: [0, 15, -15, 0],
      scale: [1, 1.1, 1], // Added a slight pulse for that 3D feel
    }}
    transition={{
      duration: 8 + Math.random() * 4,
      repeat: Infinity,
      delay: delay,
      ease: "easeInOut"
    }}
  />
);

export default FloatingCoin;