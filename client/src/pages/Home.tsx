import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { SelvaLogo } from "@/components/SelvaLogo";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#060810" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", border:"2px solid #EF701B", borderTopColor:"transparent", animation:"spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ width:"100vw", height:"100vh", overflow:"hidden", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", background:"radial-gradient(ellipse 60% 55% at 50% 40%, rgba(45,100,45,0.28) 0%, rgba(25,70,30,0.1) 45%, transparent 70%), radial-gradient(ellipse 90% 70% at 50% 50%, rgba(12,28,70,0.55) 0%, transparent 85%), #060810", position:"relative" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes star-twinkle{0%,100%{opacity:var(--op)}50%{opacity:0.05}}
      `}</style>
      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", gap:28, width:"100%", maxWidth:440, padding:"48px 40px" }}>
        <SelvaLogo size={110} />
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
          <svg viewBox="0 0 2421 201" fill="none" style={{ width:240, height:"auto" }}>
            <path d="M0 197.2V3.5H86.4C102.3 3.5 115.8 5.2 127 8.7C138.4 12.2 147.1 17.6 153.1 24.9C159.1 32.3 162.1 41.9 162.1 53.6C162.1 63.3 159.7 71.5 154.9 78.3C150 84.9 143.4 90.2 134.9 94.2C145.3 97.5 153.7 103 160.1 110.8C166.7 118.3 169.9 128 169.9 139.8C169.9 152.9 166.8 163.8 160.4 172.3C154 180.8 144.8 187 132.8 191.1C120.8 195.2 106.3 197.2 89.3 197.2H0ZM49.3 156.3H91.6C97.4 156.3 102.3 155.5 106.1 154C110.2 152.4 113.2 150.2 115.1 147.3C117.3 144.2 118.3 140.6 118.3 136.3C118.3 129.9 116 125.1 111.4 121.8C106.9 118.5 100.3 116.9 91.6 116.9H49.3V156.3ZM49.3 78.9H88.2C95.5 78.9 101.1 77.2 105 73.9C109 70.7 111.1 66.3 111.1 60.9C111.1 55.3 109.1 51 105.3 48.1C101.4 45 95.9 43.5 88.7 43.5H49.3V78.9Z" fill="#FDFFED"/>
            <path d="M191.2 197.2V3.5H282.8C296.1 3.5 308.4 5.6 319.6 9.9C331 13.9 340.1 20.5 346.9 29.6C353.9 38.5 357.3 50.2 357.3 64.7C357.3 80.5 353.2 93.1 344.9 102.4C336.5 111.6 325.9 118.1 313 121.8L367.2 197.2H309.8L260.2 126.1H240.5V197.2H191.2ZM240.5 84.4H279.9C284.9 84.4 289.3 83.7 292.9 82.4C296.8 81 299.8 78.9 301.9 76C304.3 73.1 305.4 69.3 305.4 64.7C305.4 60 304.3 56.3 301.9 53.4C299.8 50.5 296.8 48.4 292.9 47.3C289.3 45.9 284.9 45.2 279.9 45.2H240.5V84.4Z" fill="#FDFFED"/>
            <path d="M376.3 197.2L449.7 3.5H503.9L577.6 197.2H523.6L512.6 164.1H441L430.3 197.2H376.3ZM454 124.4H499.6L476.7 56L454 124.4Z" fill="#FDFFED"/>
            <path d="M594.4 197.2V3.5H655.9L728.4 136.6V3.5H775.7V197.2H713.9L641.7 64.4V197.2H594.4Z" fill="#FDFFED"/>
            <path d="M807.1 197.2V3.5H873C889.8 3.5 905.1 5.2 918.8 8.7C932.7 12.2 944.7 17.8 954.7 25.5C964.8 33.1 972.5 43 977.9 55.4C983.5 67.6 986.3 82.6 986.3 100.3C986.3 118.3 983.5 133.5 977.9 145.9C972.5 158.2 964.8 168.2 954.7 175.7C944.7 183.3 932.7 188.8 918.8 192.3C904.9 195.6 889.6 197.2 873 197.2H807.1ZM856.4 155.7H874.1C882.8 155.7 890.9 155 898.5 153.4C906 151.9 912.5 149.2 917.9 145.3C923.5 141.2 927.9 135.6 931 128.5C934.1 121.1 935.6 111.7 935.6 100.3C935.6 88.9 934.1 79.7 931 72.5C927.9 65.2 923.5 59.4 917.9 55.4C912.5 51.3 906 48.5 898.5 47C890.9 45.2 882.8 44.4 874.1 44.4H856.4V155.7Z" fill="#FDFFED"/>
            <path d="M1151 197.2V47H1089.2V3.5H1262.1V47H1200.3V197.2H1151Z" fill="#FDFFED"/>
            <path d="M1282.3 197.2V3.5H1374C1387.3 3.5 1399.6 5.6 1410.8 9.9C1422.2 13.9 1431.3 20.5 1438.1 29.6C1445 38.5 1448.5 50.2 1448.5 64.7C1448.5 80.5 1444.4 93.1 1436 102.4C1427.7 111.6 1417.1 118.1 1404.1 121.8L1458.4 197.2H1401L1351.4 126.1H1331.6V197.2H1282.3ZM1331.6 84.4H1371.1C1376.1 84.4 1380.5 83.7 1384.1 82.4C1388 81 1391 78.9 1393.1 76C1395.4 73.1 1396.6 69.3 1396.6 64.7C1396.6 60 1395.4 56.3 1393.1 53.4C1391 50.5 1388 48.4 1384.1 47.3C1380.5 45.9 1376.1 45.2 1371.1 45.2H1331.6V84.4Z" fill="#FDFFED"/>
            <path d="M1467.5 197.2L1540.9 3.5H1595.1L1668.8 197.2H1614.8L1603.8 164.1H1532.2L1521.4 197.2H1467.5ZM1545.2 124.4H1590.8L1567.8 56L1545.2 124.4Z" fill="#FDFFED"/>
            <path d="M1767.6 200.7C1747.3 200.7 1729.7 196.7 1714.8 188.8C1700.2 180.7 1688.8 169.2 1680.9 154.3C1673 139.2 1669 121.2 1669 100.3C1669 79.8 1673.1 62.2 1681.2 47.3C1689.3 32.2 1700.8 20.6 1715.7 12.5C1730.6 4.2 1748.2 0 1768.5 0C1787.3 0 1803.5 4.2 1817.2 12.5C1830.9 20.6 1841.6 31.5 1849.1 45.2L1805.3 61.2C1801.1 53.5 1795.4 48.1 1788.2 45.2C1781.1 42.1 1774 40.6 1767 40.6C1758.5 40.6 1750.8 43 1743.8 47.8C1737.1 52.5 1731.7 59.3 1727.6 68.1C1723.5 77 1721.5 87.8 1721.5 100.3C1721.5 113.3 1723.5 124.2 1727.6 133.1C1731.7 142 1737.2 148.8 1744.1 153.4C1751.3 157.9 1759.1 160.1 1767.6 160.1C1771.9 160.1 1776.4 159.6 1781.3 158.6C1786.3 157.5 1791.1 155.4 1795.8 152.5C1800.4 149.6 1804.2 145.4 1807.1 139.8L1850.3 155.7C1842.4 169.5 1831.2 180.4 1816.9 188.5C1802.6 196.6 1786.2 200.7 1767.6 200.7Z" fill="#FDFFED"/>
            <path d="M1869.4 197.2V3.5H1918.7V76.6L1985.4 3.5H2045.5L1968.3 87L2048.4 197.2H1991.5L1936.7 120.9L1918.7 140.6V197.2H1869.4Z" fill="#FDFFED"/>
            <path d="M2066.8 197.2V3.5H2217.9V47H2116.1V76H2176.4V119.2H2116.1V153.7H2219.1V197.2H2066.8Z" fill="#FDFFED"/>
            <path d="M2244.7 197.2V3.5H2336.3C2349.7 3.5 2361.9 5.6 2373.1 9.9C2384.5 13.9 2393.6 20.5 2400.4 29.6C2407.4 38.5 2410.8 50.2 2410.8 64.7C2410.8 80.5 2406.7 93.1 2398.4 102.4C2390.1 111.6 2379.4 118.1 2366.5 121.8L2420.7 197.2H2363.3L2313.7 126.1H2294V197.2H2244.7ZM2294 84.4H2333.4C2338.4 84.4 2342.8 83.7 2346.5 82.4C2350.3 81 2353.3 78.9 2355.5 76C2357.8 73.1 2358.9 69.3 2358.9 64.7C2358.9 60 2357.8 56.3 2355.5 53.4C2353.3 50.5 2350.3 48.4 2346.5 47.3C2342.8 45.9 2338.4 45.2 2333.4 45.2H2294V84.4Z" fill="#FDFFED"/>
          </svg>
          <div style={{ fontSize:9, fontWeight:200, letterSpacing:"0.26em", textTransform:"uppercase", color:"rgba(253,255,237,0.3)" }}>
            Powered by{" "}
            <a href="https://www.selva.agency" target="_blank" style={{ color:"rgba(253,255,237,0.45)", textDecoration:"none", borderBottom:"0.5px solid rgba(253,255,237,0.2)", paddingBottom:1 }}>SELVA Agency</a>
          </div>
        </div>
        <hr style={{ width:"100%", border:"none", borderTop:"0.5px solid rgba(253,255,237,0.08)" }} />
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:15, fontWeight:400, color:"rgba(253,255,237,0.85)", marginBottom:8 }}>Acesse sua plataforma</div>
          <div style={{ fontSize:12, fontWeight:200, color:"rgba(253,255,237,0.35)", lineHeight:1.7 }}>
            Use suas credenciais para entrar<br/>no painel de inteligência de performance digital.
          </div>
        </div>
        <a href={getLoginUrl()} style={{ width:"100%", padding:"14px 24px", background:"rgba(239,112,27,0.1)", border:"1px solid rgba(239,112,27,0.45)", borderRadius:4, color:"#EF701B", fontSize:11, fontWeight:400, letterSpacing:"0.2em", textTransform:"uppercase", textDecoration:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          Entrar no Brand Tracker
        </a>
        <a href="https://www.selva.agency" style={{ fontSize:9, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(253,255,237,0.18)", textDecoration:"none" }}>
          ← SELVA Agency
        </a>
      </div>
    </div>
  );
}
