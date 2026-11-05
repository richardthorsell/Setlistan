import "./landing.css";

// Illustrations of the service built from plain markup, used on the front page and in the welcome guide.
// The content is made up and marked as an example.

const CARDS = [
  { n: "001", l: "Mittfältare", have: true },
  { n: "002", l: "Anfallare", have: true },
  { n: "003", l: "Försvarare", have: false },
  { n: "004", l: "Målvakt", have: true },
  { n: "005", l: "Anfallare", have: false, par: "/50" },
  { n: "006", l: "Mittfältare", have: true },
  { n: "007", l: "Försvarare", have: false },
  { n: "008", l: "Anfallare", have: true, par: "/25" },
];

const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5 10 17 19 7" />
  </svg>
);

function MockCard({ n, l, have, par }: { n: string; l: string; have: boolean; par?: string }) {
  return (
    <div className={`mk-card ${have ? "have" : ""}`}>
      <span className="mk-num mono">#{n}</span>
      <span className="mk-pos">{l}</span>
      {par && <span className="mk-par mono">{par}</span>}
      {have && (
        <span className="mk-tick">
          <Tick />
        </span>
      )}
    </div>
  );
}

const Frame = ({ children, label = "Exempel" }: { children: React.ReactNode; label?: string }) => (
  <div className="mk" aria-hidden="true">
    <span className="mk-tag">{label}</span>
    {children}
  </div>
);

// A whole set with progress.
export function MockSet() {
  const have = CARDS.filter((c) => c.have).length;
  return (
    <Frame>
      <div className="mk-head">
        <b>Premier League Flagship</b>
        <span className="mono">{have} / {CARDS.length}</span>
      </div>
      <div className="mk-bar"><i style={{ width: `${(have / CARDS.length) * 100}%` }} /></div>
      <div className="mk-grid">
        {CARDS.map((c) => <MockCard key={c.n} {...c} />)}
      </div>
      <div className="mk-foot">{CARDS.length - have} kort saknas</div>
    </Frame>
  );
}

export function MockSearch() {
  return (
    <Frame>
      <div className="mk-search">
        <span>Topps Premier League Flagship 26/27</span>
        <b>Hämta</b>
      </div>
      <div className="mk-result"><b>Premier League Flagship 26/27</b><span className="mono">201 kort</span></div>
      <div className="mk-result"><b>Premier League Chrome 25/26</b><span className="mono">201 kort</span></div>
    </Frame>
  );
}

export function MockTick() {
  return (
    <Frame>
      <div className="mk-grid four">
        {CARDS.slice(0, 4).map((c) => <MockCard key={c.n} {...c} />)}
      </div>
      <div className="mk-chips">
        <span className="mk-chip on">Basversion</span>
        <span className="mk-chip">/50</span>
        <span className="mk-chip">/25</span>
      </div>
    </Frame>
  );
}

export function MockMissing() {
  return (
    <Frame>
      <div className="mk-chips">
        <span className="mk-chip">Alla</span>
        <span className="mk-chip on">Saknas</span>
        <span className="mk-chip">Har</span>
      </div>
      <div className="mk-rows">
        {CARDS.filter((c) => !c.have).map((c) => (
          <div key={c.n} className="mk-row"><span className="mono">#{c.n}</span><span>{c.l}</span>{c.par && <span className="mk-par mono">{c.par}</span>}</div>
        ))}
      </div>
      <div className="mk-foot">Exportera som lista</div>
    </Frame>
  );
}

export function MockTradera() {
  return (
    <Frame label="Exempel, påhittade priser">
      <div className="mk-head">
        <b>Sålt på Tradera</b>
        <span className="mk-t mono">T</span>
      </div>
      <div className="mk-stats"><b className="mono">380 kr</b> i median · lägst 210 kr · högst 650 kr</div>
      <div className="mk-sold"><span className="mk-ph" /><span>Kort #005 /50</span><b className="mono">Såld för 450 kr</b></div>
      <div className="mk-sold"><span className="mk-ph" /><span>Kort #008 /25</span><b className="mono">Såld för 650 kr</b></div>
    </Frame>
  );
}
