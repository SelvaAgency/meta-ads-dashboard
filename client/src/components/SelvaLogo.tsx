import React from "react";

export function SelvaLogo({ size = 52 }: { size?: number }) {
  const r1w = size * 0.86;
  const r1h = size * 0.3;
  const r2w = size * 0.96;
  const r2h = size * 0.24;
  const d1 = size * 0.08;
  const d2 = size * 0.065;
  return (
    <div style={{ position:"relative", width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <style>{`
        @keyframes slv-halo{0%,100%{opacity:.4}50%{opacity:.9}}
        @keyframes slv-r1{from{transform:rotateX(70deg) rotateZ(0deg)}to{transform:rotateX(70deg) rotateZ(360deg)}}
        @keyframes slv-r2{from{transform:rotateX(75deg) rotateZ(60deg)}to{transform:rotateX(75deg) rotateZ(420deg)}}
      `}</style>
      <div style={{ position:"absolute", inset:-size*0.18, borderRadius:"50%", background:"radial-gradient(circle,rgba(253,255,237,.07) 0%,transparent 70%)", animation:"slv-halo 4s ease-in-out infinite" }} />
      <div style={{ position:"absolute", top:"50%", left:"50%", width:r1w, height:r1h, marginLeft:-r1w/2, marginTop:-r1h/2, borderRadius:"50%", border:"0.8px solid rgba(253,255,237,.25)", animation:"slv-r1 10s linear infinite" }} />
      <div style={{ position:"absolute", top:"50%", left:"50%", width:r2w, height:r2h, marginLeft:-r2w/2, marginTop:-r2h/2, borderRadius:"50%", border:"0.5px solid rgba(239,112,27,.3)", animation:"slv-r2 16s linear infinite reverse" }} />
      <div style={{ position:"absolute", top:"50%", left:"50%", width:d1, height:d1, marginLeft:-d1/2, marginTop:-d1/2, borderRadius:"50%", background:"#FDFFED", boxShadow:"0 0 6px rgba(253,255,237,.9)", animation:"slv-r1 10s linear infinite" }} />
      <div style={{ position:"absolute", top:"50%", left:"50%", width:d2, height:d2, marginLeft:-d2/2, marginTop:-d2/2, borderRadius:"50%", background:"#EF701B", boxShadow:"0 0 6px rgba(239,112,27,.9)", animation:"slv-r2 16s linear infinite reverse" }} />
      <svg width={size*.72} height={size*.72} viewBox="0 0 523 523" fill="none" style={{ position:"relative", zIndex:2 }}>
        <circle cx="261.5" cy="261.5" r="256" stroke="rgba(253,255,237,.08)" strokeWidth="1"/>
        <path d="M257.4 141.2C238.2 151.1 219 162.9 200.3 176.3C170.7 197.6 144.4 221.4 123.2 245.9C114.3 235.9 109.7 223.5 111.5 208.1C114.9 177.4 133.7 156.8 167.3 146.9C190.3 140.1 219.9 138.2 257.4 141.2Z" fill="#FDFFED"/>
        <path d="M410.6 317.3C404.7 369.7 356.7 391.6 263.9 384.1C283.8 373.9 303.8 361.7 323.3 347.7C352.3 326.9 378.1 303.6 399 279.6C407.8 289.7 412.3 302 410.6 317.3Z" fill="#FDFFED"/>
        <path d="M210.4 219.2C210.9 222 223.7 225.4 234.3 228.4C249.8 230.8 266.3 233.4 266.7 233.5C311.4 240.8 367.6 249.9 394.8 275.3C374.1 299.1 348.6 322.1 319.7 342.8C297.3 358.9 274.6 372.3 252.4 383C178.1 374.6 103.8 359.9 103.1 283.8L103.1 282.2C103.8 281.1 105.4 278.8 200.6 289.4L201.7 291.8C207.8 305.7 224.7 313.7 255 317.1C288.2 320.8 311.6 306.4 311.6 306.4C298.3 300 274.3 294.8 255.7 291.9C210.8 284.6 154.6 275.5 127.4 250.3C148 226.5 173.8 202.8 203.8 181.2C225.4 165.8 247.3 152.7 268.7 142.2C347.2 151.4 418.9 241.7 418.9 244C418.3 244.9 417 246.7 321.3 236.1L320.3 233.6C314.3 219.6 297.8 211.8 267 208.4C232.7 204.6 211.6 208.6 210.4 219.2Z" fill="#FDFFED"/>
        <path d="M263.9 384.1C234.1 399.3 204.6 410 177.2 415.2C158.9 418.7 142.5 419.6 128.3 418.1C106.1 415.6 89.3 407.1 79.2 393C62.5 369.7 66.2 334.2 89.6 293C98.5 277.3 109.8 261.5 123.2 245.9C124.5 247.4 125.9 248.9 127.4 250.3C119.2 259.8 111.8 269.4 105.4 278.8L103.1 282.2C75 324.8 66.3 364.7 84.1 389.5C93.4 402.5 109.1 410 129.1 412.2C161.8 415.8 205.8 405.5 252.4 383L263.9 384.1Z" fill="#FDFFED" fillOpacity=".6"/>
        <path d="M434 231C424.8 247.2 413 263.6 399 279.6C397.7 278.2 396.3 276.7 394.8 275.3C403 265.9 410.5 256.3 417 246.7L418.9 244C422.5 238.6 425.8 233.3 428.8 228C451 189 454.7 155.8 439.5 134.6C414.6 99.8 344.7 104.9 268.7 142.2C264.8 141.8 261.1 141.5 257.4 141.2C263.1 138.2 268.7 135.4 274.4 132.8C299.1 121.4 323.5 113.2 346.4 108.8C392.9 99.9 427.7 107.8 444.4 131C461.1 154.3 457.4 189.8 434 231Z" fill="#FDFFED" fillOpacity=".6"/>
        <ellipse cx="261.5" cy="261.5" rx="245" ry="88" stroke="rgba(253,255,237,.1)" strokeWidth="1" fill="none" transform="rotate(-20 261.5 261.5)"/>
      </svg>
    </div>
  );
}
