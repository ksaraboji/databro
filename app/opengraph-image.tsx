import { ImageResponse } from 'next/og'
 
// Route segment config
export const dynamic = 'force-static';
// export const runtime = 'edge'
 
// Image metadata
export const alt = 'Databro. - Kumar Saraboji'
export const size = {
  width: 1200,
  height: 630,
}
 
export const contentType = 'image/png'
 
// Image generation
export default async function Image() {
  // Font loading could be added here if we had a specific font file, 
  // but for now we'll stick to system sans-serif which works well in OG images
  
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a', // Slate-900 background matches dark theme
          color: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '4px solid #4f46e5', // Indigo-600 border
            borderRadius: '24px',
            padding: '60px 100px',
            background: 'linear-gradient(to bottom right, #1e293b, #0f172a)', // Slate-800 to Slate-900
          }}
        >
          <div
            style={{
              fontSize: 100,
              fontWeight: 900,
              background: 'linear-gradient(to right, #818cf8, #4f46e5)', // Indigo-400 to Indigo-600
              backgroundClip: 'text',
              color: 'transparent',
              marginBottom: 20,
              fontFamily: 'sans-serif',
            }}
          >
            Databro.
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#94a3b8', // Slate-400
              fontFamily: 'sans-serif',
              textAlign: 'center',
              fontWeight: 600,
              letterSpacing: '-0.025em',
            }}
          >
             Data Engineer & AI Tinkerer
          </div>
          <div
             style={{
                marginTop: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                color: '#cbd5e1', // Slate-300
                fontFamily: 'monospace',
             }}
          >
            check out databro.dev
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
