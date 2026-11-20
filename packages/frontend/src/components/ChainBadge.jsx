import React, { useEffect, useState } from 'react';
import { readSupportedChainsCache } from '../utils/walletCache';

const lookupChainLogo = (chain) => {
  try {
    const raw = localStorage.getItem('salva_user');
    const email = raw ? JSON.parse(raw)?.email : null;
    if (!email) return null;

    const list = readSupportedChainsCache(email)?.chains || [];
    const match = list.find((c) => String(c?.chainName || c?.name || '').toLowerCase() === chain);

    return match?.logo || null;
  } catch {
    return null;
  }
};

const useChainLogo = (chain) => {
  const name = String(chain || '').toLowerCase();
  const logo = name ? lookupChainLogo(name) : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logo]);

  return { name, logo: failed ? null : logo, onError: () => setFailed(true) };
};

const ChainBadge = ({ chain, className = 'w-3.5 h-3.5 sm:w-4 sm:h-4', ringColor = '#0A0A0B' }) => {
  const { name, logo, onError } = useChainLogo(chain);

  if (!logo) return null;

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 ${className} rounded-full overflow-hidden`}
      style={{ background: ringColor, border: `2px solid ${ringColor}` }}
      title={name}
    >
      <img
        src={logo}
        alt={name}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        onError={onError}
      />
    </span>
  );
};

export const ChainLogo = ({ chain, className = 'w-4 h-4' }) => {
  const { name, logo, onError } = useChainLogo(chain);

  if (!logo) return null;

  return (
    <img
      src={logo}
      alt={name}
      title={name}
      referrerPolicy="no-referrer"
      className={`${className} rounded-full object-cover flex-shrink-0`}
      onError={onError}
    />
  );
};

export default ChainBadge;
