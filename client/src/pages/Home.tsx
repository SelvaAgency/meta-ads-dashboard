import { getLoginUrl } from "@/const";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace(getLoginUrl());
  }, []);

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#060810" }}>
      <div style={{ width:28, height:28, borderRadius:"50%", border:"2px solid #EF701B", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
