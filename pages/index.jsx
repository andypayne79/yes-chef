import Head from "next/head";
import dynamic from "next/dynamic";
const YesChef = dynamic(() => import("../components/YesChef"), { ssr: false });
export default function Home() {
  return (
    <>
      <Head>
        <title>Payne's Yes Chef</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#141F10" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Yes Chef" />
        <link rel="manifest" href="/manifest.json" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
          html, body { background: #F8F3EA; font-family: 'DM Sans', sans-serif; }
          @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          @keyframes fadeIn { from{opacity:0} to{opacity:1} }
          @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.38} }
          @keyframes popIn  { 0%{transform:scale(.88);opacity:0} 75%{transform:scale(1.03)} 100%{transform:scale(1);opacity:1} }
          @keyframes shimmer{ 0%{background-position:-500px 0} 100%{background-position:500px 0} }
          .fadeUp{animation:fadeUp .38s cubic-bezier(.22,1,.36,1) both}
          .fadeIn{animation:fadeIn .25s ease both}
          .popIn{animation:popIn .36s cubic-bezier(.22,1,.36,1) both}
          .pulse{animation:pulse 1.5s ease-in-out infinite}
          .shim{background:linear-gradient(90deg,#ede7db 25%,#f7f0e4 50%,#ede7db 75%);background-size:800px 100%;animation:shimmer 1.5s infinite;}
          input:focus,select:focus{outline:none;box-shadow:0 0 0 2.5px #C9912A !important;}
          .press:active{transform:scale(.96);}
          input,select,button{font-family:'DM Sans',sans-serif;}
        `}</style>
      </Head>
      <YesChef />
    </>
  );
}
