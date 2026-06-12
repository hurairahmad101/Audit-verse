'use client';

import { useState, useEffect } from 'react';
import { Montserrat } from 'next/font/google';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '700', '800', '900'],
});

const TOTAL = 12;
const BG = '#0A0A0F';
const BLUE = '#2563EB';
const RED = '#DC2626';
const AMBER = '#F59E0B';
const WHITE = '#F8FAFC';
const DIM = 'rgba(248,250,252,0.55)';

export default function PitchDeckPage() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrent(c => Math.min(c + 1, TOTAL - 1));
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrent(c => Math.max(c - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const goNext = () => setCurrent(c => Math.min(c + 1, TOTAL - 1));
  const goPrev = () => setCurrent(c => Math.max(c - 1, 0));

  return (
    <div
      className={montserrat.className}
      style={{ position: 'fixed', inset: 0, background: BG, overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', inset: 0, paddingBottom: '7vh' }} onClick={goNext}>
        {current === 0 && <Slide1 />}
        {current === 1 && <Slide2 />}
        {current === 2 && <Slide3 />}
        {current === 3 && <Slide4 />}
        {current === 4 && <Slide5 />}
        {current === 5 && <Slide6 />}
        {current === 6 && <Slide7 />}
        {current === 7 && <Slide8 />}
        {current === 8 && <Slide9 />}
        {current === 9 && <Slide10 />}
        {current === 10 && <Slide11 />}
        {current === 11 && <Slide12 />}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: '7vh',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 3vw',
        background: 'rgba(10,10,15,0.92)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(248,250,252,0.06)',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          <Link
            href="/audit"
            onClick={e => e.stopPropagation()}
            style={{
              color: DIM, fontSize: '1.3vw', display: 'flex', alignItems: 'center',
              gap: '0.5vw', textDecoration: 'none', letterSpacing: '0.05em',
            }}
          >
            <X style={{ width: '1.2vw', height: '1.2vw' }} />
            Exit
          </Link>
          <a
            href="/auditverse-keynote.html"
            download="AuditVerse-Keynote.html"
            onClick={e => e.stopPropagation()}
            style={{
              color: BLUE, fontSize: '1.3vw', display: 'flex', alignItems: 'center',
              gap: '0.5vw', textDecoration: 'none', letterSpacing: '0.05em',
              border: `1px solid rgba(37,99,235,0.4)`, borderRadius: '0.4vw',
              padding: '0.5vh 0.8vw',
            }}
          >
            &#8595; Download HTML
          </a>
        </div>

        <div style={{ display: 'flex', gap: '0.5vw', alignItems: 'center' }}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              style={{
                width: i === current ? '2.2vw' : '0.5vw',
                height: '0.4vh',
                borderRadius: '0.2vw',
                background: i === current ? BLUE : 'rgba(248,250,252,0.2)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                padding: 0,
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            disabled={current === 0}
            style={{
              background: 'none', border: 'none', cursor: current === 0 ? 'default' : 'pointer',
              color: current === 0 ? 'rgba(248,250,252,0.2)' : DIM, display: 'flex', padding: 0,
            }}
          >
            <ArrowLeft style={{ width: '1.6vw', height: '1.6vw' }} />
          </button>
          <span style={{ color: DIM, fontSize: '1.2vw', minWidth: '4vw', textAlign: 'center' }}>
            {current + 1} / {TOTAL}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            disabled={current === TOTAL - 1}
            style={{
              background: 'none', border: 'none', cursor: current === TOTAL - 1 ? 'default' : 'pointer',
              color: current === TOTAL - 1 ? 'rgba(248,250,252,0.2)' : WHITE, display: 'flex', padding: 0,
            }}
          >
            <ArrowRight style={{ width: '1.6vw', height: '1.6vw' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Slide1() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.09) 0%, ${BG} 70%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '0.35vh',
        background: `linear-gradient(90deg, transparent 0%, ${AMBER} 25%, ${AMBER} 75%, transparent 100%)`,
      }} />

      <div style={{ textAlign: 'center', maxWidth: '78vw' }}>
        <div style={{
          color: 'rgba(248,250,252,0.3)', fontSize: '1.3vw', letterSpacing: '0.35em',
          marginBottom: '3vh', textTransform: 'uppercase', fontWeight: 700,
        }}>
          AuditVerse.AI
        </div>
        <h1 style={{
          color: WHITE, fontSize: '7.5vw', fontWeight: 900, lineHeight: 1.03,
          letterSpacing: '-0.025em', margin: 0,
        }}>
          The world has an<br />audit problem.
        </h1>
        <p style={{
          color: DIM, fontSize: '2.4vw', fontWeight: 400,
          marginTop: '4.5vh', letterSpacing: '0.01em',
        }}>
          And nobody has solved it. Until now.
        </p>
      </div>

      <div style={{
        position: 'absolute', bottom: '4vh', left: 0, right: 0,
        textAlign: 'center', color: 'rgba(248,250,252,0.12)',
        fontSize: '1.1vw', letterSpacing: '0.2em', fontWeight: 700,
      }}>
        PRESS SPACE OR CLICK TO CONTINUE
      </div>
    </div>
  );
}

function Slide2() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 55% 70% at 35% 55%, rgba(220,38,38,0.12) 0%, ${BG} 65%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '0 8vw',
    }}>
      <div style={{
        color: RED, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '2vh', textTransform: 'uppercase',
      }}>
        The cost of failure
      </div>
      <div style={{
        color: '#EF4444', fontSize: '15vw', fontWeight: 900,
        lineHeight: 0.88, letterSpacing: '-0.04em',
      }}>
        $14.8B
      </div>
      <div style={{
        color: WHITE, fontSize: '3vw', fontWeight: 700, marginTop: '3vh', lineHeight: 1.2,
      }}>
        in regulatory fines.
        <span style={{ color: DIM, fontWeight: 400 }}> Last year alone.</span>
      </div>
      <div style={{
        color: DIM, fontSize: '1.9vw', fontWeight: 400, marginTop: '3.5vh', lineHeight: 1.7,
      }}>
        Banks. Hospitals. Energy firms. Government agencies.<br />
        All paying the price for audit failures they never saw coming.
      </div>

      <div style={{
        position: 'absolute', right: 0, top: '15vh', bottom: '15vh', width: '0.3vw',
        background: `linear-gradient(180deg, transparent 0%, ${RED} 25%, ${RED} 75%, transparent 100%)`,
      }} />
    </div>
  );
}

function Slide3() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 50% 55% at 65% 45%, rgba(245,158,11,0.08) 0%, ${BG} 60%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'flex-start', padding: '0 8vw',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.025,
        backgroundImage: `linear-gradient(${WHITE} 1px, transparent 1px), linear-gradient(90deg, ${WHITE} 1px, transparent 1px)`,
        backgroundSize: '5vw 5vw',
      }} />

      <div style={{
        color: AMBER, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '2.5vh', textTransform: 'uppercase', position: 'relative',
      }}>
        The problem
      </div>
      <h2 style={{
        color: WHITE, fontSize: '5.5vw', fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.025em', margin: 0, maxWidth: '70vw', position: 'relative',
      }}>
        Your audit team is running<br />on spreadsheets.
      </h2>
      <div style={{
        color: DIM, fontSize: '2vw', fontWeight: 400,
        marginTop: '4vh', lineHeight: 1.65, maxWidth: '55vw', position: 'relative',
      }}>
        Hundreds of hours. Thousands of cells.<br />
        One version conflict away from a material finding.
      </div>

      <div style={{
        position: 'absolute', bottom: '8vh', left: '8vw',
        width: '7vw', height: '0.4vh', background: AMBER,
      }} />
    </div>
  );
}

function Slide4() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 70% 55% at 50% 60%, rgba(220,38,38,0.1) 0%, ${BG} 60%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', textAlign: 'center',
      padding: '0 10vw',
    }}>
      <div style={{
        color: RED, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '3vh', textTransform: 'uppercase',
      }}>
        The gap
      </div>
      <h2 style={{
        color: WHITE, fontSize: '8.5vw', fontWeight: 900, lineHeight: 1.0,
        letterSpacing: '-0.03em', margin: 0,
      }}>
        Zero real-time<br />visibility.
      </h2>
      <div style={{
        color: DIM, fontSize: '2.2vw', fontWeight: 400,
        marginTop: '5vh', lineHeight: 1.6,
      }}>
        By the time leadership sees the risk,<br />
        the auditors are already six months behind.
      </div>

      <div style={{
        position: 'absolute', right: '7vw', top: '18vh',
        width: '20vw', height: '20vw', borderRadius: '50%',
        border: `1px solid rgba(220,38,38,0.18)`,
      }} />
      <div style={{
        position: 'absolute', right: '9.5vw', top: '22vh',
        width: '13vw', height: '13vw', borderRadius: '50%',
        border: `1px solid rgba(220,38,38,0.1)`,
      }} />
      <div style={{
        position: 'absolute', right: '12vw', top: '26vh',
        width: '6vw', height: '6vw', borderRadius: '50%',
        background: 'rgba(220,38,38,0.06)',
        border: `1px solid rgba(220,38,38,0.2)`,
      }} />
    </div>
  );
}

function Slide5() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 65% 65% at 50% 50%, rgba(37,99,235,0.22) 0%, rgba(37,99,235,0.04) 55%, ${BG} 75%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '45vw', height: '45vw', borderRadius: '50%',
        background: `radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)`,
        filter: 'blur(5vw)',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          color: 'rgba(37,99,235,0.8)', fontSize: '1.3vw', fontWeight: 700,
          letterSpacing: '0.3em', marginBottom: '4vh', textTransform: 'uppercase',
        }}>
          The revolution
        </div>
        <h2 style={{
          color: WHITE, fontSize: '7vw', fontWeight: 900, lineHeight: 1.05,
          letterSpacing: '-0.025em', margin: 0,
        }}>
          Today, we change<br />everything.
        </h2>
        <div style={{ marginTop: '5.5vh' }}>
          <div style={{
            display: 'inline-block',
            color: BLUE, fontSize: '3.2vw', fontWeight: 800,
            letterSpacing: '-0.01em',
            borderBottom: `0.25vh solid ${BLUE}`,
            paddingBottom: '0.6vh',
          }}>
            Introducing AuditVerse.AI
          </div>
        </div>
      </div>
    </div>
  );
}

function Slide6() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(140deg, rgba(37,99,235,0.07) 0%, ${BG} 50%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '0 8vw',
    }}>
      <div style={{
        position: 'absolute', left: '4vw', top: '20vh', bottom: '20vh', width: '0.3vw',
        background: `linear-gradient(180deg, transparent 0%, ${BLUE} 20%, ${BLUE} 80%, transparent 100%)`,
      }} />

      <div style={{
        color: BLUE, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '2.5vh', textTransform: 'uppercase',
      }}>
        Capability 01 — Audit Universe
      </div>
      <h2 style={{
        color: WHITE, fontSize: '4.8vw', fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.02em', margin: 0, maxWidth: '72vw',
      }}>
        Know what to audit.<br />Before the regulator does.
      </h2>
      <div style={{
        color: DIM, fontSize: '2vw', fontWeight: 400,
        marginTop: '4vh', lineHeight: 1.65, maxWidth: '62vw',
      }}>
        AI-powered Audit Universe maps every auditable entity across your organization
        — scored, ranked, and ready.<br />Annual plans generated in minutes, not months.
      </div>
    </div>
  );
}

function Slide7() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(220deg, rgba(37,99,235,0.07) 0%, ${BG} 50%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'flex-end', padding: '0 8vw', textAlign: 'right',
    }}>
      <div style={{
        position: 'absolute', right: '4vw', top: '20vh', bottom: '20vh', width: '0.3vw',
        background: `linear-gradient(180deg, transparent 0%, ${BLUE} 20%, ${BLUE} 80%, transparent 100%)`,
      }} />

      <div style={{
        color: BLUE, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '2.5vh', textTransform: 'uppercase',
      }}>
        Capability 02 — Engagements
      </div>
      <h2 style={{
        color: WHITE, fontSize: '4.8vw', fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.02em', margin: 0, maxWidth: '72vw',
      }}>
        Run engagements your<br />team actually loves.
      </h2>
      <div style={{
        color: DIM, fontSize: '2vw', fontWeight: 400,
        marginTop: '4vh', lineHeight: 1.65, maxWidth: '62vw',
      }}>
        From planning to fieldwork to reporting — one connected workflow.<br />
        AI writes the fieldwork guide. Your team executes it.
      </div>
    </div>
  );
}

function Slide8() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(37,99,235,0.07) 0%, ${BG} 60%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '0 8vw',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '8vw', right: '8vw', height: '0.3vh',
        background: `linear-gradient(90deg, transparent 0%, ${BLUE} 30%, ${BLUE} 70%, transparent 100%)`,
      }} />

      <div style={{
        color: BLUE, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '2.5vh', textTransform: 'uppercase',
      }}>
        Capability 03 — Findings
      </div>
      <h2 style={{
        color: WHITE, fontSize: '4.8vw', fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.02em', margin: 0, maxWidth: '68vw',
      }}>
        Every finding. Every action.<br />Fully tracked.
      </h2>
      <div style={{
        color: DIM, fontSize: '2vw', fontWeight: 400,
        marginTop: '4vh', lineHeight: 1.65, maxWidth: '62vw',
      }}>
        CCCE documentation. Severity calibration. Multi-level escalation.<br />
        Nothing falls through the cracks.
      </div>
    </div>
  );
}

function Slide9() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(155deg, rgba(37,99,235,0.09) 0%, ${BG} 45%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '0 8vw',
    }}>
      <div style={{
        color: BLUE, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '2.5vh', textTransform: 'uppercase',
      }}>
        Capability 04 — Frameworks
      </div>
      <h2 style={{
        color: WHITE, fontSize: '4.8vw', fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.02em', margin: 0,
      }}>
        60+ compliance frameworks.<br />Built in.
      </h2>
      <div style={{
        color: DIM, fontSize: '2vw', fontWeight: 400,
        marginTop: '3.5vh', lineHeight: 1.8, maxWidth: '65vw',
      }}>
        GDPR. HIPAA. SOX. ISO 27001. Basel III. DORA. NIS2. NERC-CIP. GRI. TCFD.
      </div>
      <div style={{
        color: 'rgba(248,250,252,0.3)', fontSize: '1.8vw', fontWeight: 400,
        marginTop: '2vh', lineHeight: 1.5,
      }}>
        Switch industries. The frameworks come with you.
      </div>

      <div style={{
        position: 'absolute', right: '5vw', top: '50%', transform: 'translateY(-50%)',
        fontSize: '22vw', fontWeight: 900, color: 'rgba(37,99,235,0.06)',
        letterSpacing: '-0.05em', lineHeight: 1, userSelect: 'none',
      }}>
        60+
      </div>
    </div>
  );
}

function Slide10() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 65% 55% at 55% 50%, rgba(37,99,235,0.14) 0%, ${BG} 65%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', textAlign: 'center',
      padding: '0 10vw',
    }}>
      <div style={{
        color: BLUE, fontSize: '1.3vw', fontWeight: 700,
        letterSpacing: '0.25em', marginBottom: '3.5vh', textTransform: 'uppercase',
      }}>
        Capability 05 — AI Intelligence
      </div>
      <h2 style={{
        color: WHITE, fontSize: '5.5vw', fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.025em', margin: 0,
      }}>
        Your smartest auditor<br />never sleeps.
      </h2>
      <div style={{
        color: DIM, fontSize: '2.1vw', fontWeight: 400,
        marginTop: '4.5vh', lineHeight: 1.65, maxWidth: '65vw',
      }}>
        AI that drafts findings, calibrates risk, generates reports,<br />
        and answers compliance questions in plain English.
      </div>

      <div style={{ width: '6vw', height: '0.4vh', background: BLUE, marginTop: '5.5vh' }} />
    </div>
  );
}

function Slide11() {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: BG,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '2vh 6vw 3vh',
    }}>
      <h2 style={{
        color: WHITE, fontSize: '3.2vw', fontWeight: 900, lineHeight: 1.15,
        letterSpacing: '-0.02em', margin: 0, marginBottom: '4.5vh', textAlign: 'center',
      }}>
        Built for every industry that can't afford to fail.
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5vh 2vw', flex: 1, maxHeight: '52vh' }}>
        <div style={{
          background: 'rgba(37,99,235,0.09)', border: '1px solid rgba(37,99,235,0.22)',
          borderRadius: '0.8vw', padding: '2.5vh 2.5vw',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ color: BLUE, fontSize: '1.1vw', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '1.5vh', textTransform: 'uppercase' }}>
            Banking & Financial Services
          </div>
          <div style={{ color: DIM, fontSize: '1.75vw', lineHeight: 2, fontWeight: 400 }}>
            SOX · DORA · Basel III · PCI-DSS
          </div>
        </div>

        <div style={{
          background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)',
          borderRadius: '0.8vw', padding: '2.5vh 2.5vw',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ color: BLUE, fontSize: '1.1vw', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '1.5vh', textTransform: 'uppercase' }}>
            Healthcare
          </div>
          <div style={{ color: DIM, fontSize: '1.75vw', lineHeight: 2, fontWeight: 400 }}>
            HIPAA · FDA 21 CFR Part 11 · ISO 9001
          </div>
        </div>

        <div style={{
          background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)',
          borderRadius: '0.8vw', padding: '2.5vh 2.5vw',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ color: BLUE, fontSize: '1.1vw', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '1.5vh', textTransform: 'uppercase' }}>
            Energy & Utilities
          </div>
          <div style={{ color: DIM, fontSize: '1.75vw', lineHeight: 2, fontWeight: 400 }}>
            NERC-CIP · ISO 50001 · IEC 62443
          </div>
        </div>

        <div style={{
          background: 'rgba(37,99,235,0.09)', border: '1px solid rgba(37,99,235,0.22)',
          borderRadius: '0.8vw', padding: '2.5vh 2.5vw',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ color: BLUE, fontSize: '1.1vw', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '1.5vh', textTransform: 'uppercase' }}>
            Government & Public Sector
          </div>
          <div style={{ color: DIM, fontSize: '1.75vw', lineHeight: 2, fontWeight: 400 }}>
            FISMA · FedRAMP · NIST 800-53
          </div>
        </div>
      </div>
    </div>
  );
}

function Slide12() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(37,99,235,0.14) 0%, ${BG} 70%)`,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{
        color: DIM, fontSize: '2.2vw', fontWeight: 400,
        letterSpacing: '0.05em', marginBottom: '4.5vh', fontStyle: 'italic',
      }}>
        One more thing.
      </div>
      <h2 style={{
        color: WHITE, fontSize: '4.5vw', fontWeight: 900, lineHeight: 1.2,
        letterSpacing: '-0.02em', margin: 0, maxWidth: '65vw',
      }}>
        AuditVerse.AI doesn't just manage audits.<br />It makes audit teams unstoppable.
      </h2>
      <p style={{
        color: DIM, fontSize: '2.3vw', fontWeight: 400,
        marginTop: '5.5vh', letterSpacing: '0.02em',
      }}>
        The future of audit starts now.
      </p>

      <div style={{
        marginTop: '8vh', borderTop: '1px solid rgba(248,250,252,0.1)',
        paddingTop: '3.5vh', width: '28vw', textAlign: 'center',
      }}>
        <div style={{ color: BLUE, fontSize: '2.2vw', fontWeight: 800, letterSpacing: '0.04em' }}>
          AuditVerse.AI
        </div>
        <div style={{
          color: 'rgba(248,250,252,0.25)', fontSize: '1.1vw', marginTop: '1.2vh',
          letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase',
        }}>
          Enterprise Audit Intelligence
        </div>
      </div>
    </div>
  );
}
