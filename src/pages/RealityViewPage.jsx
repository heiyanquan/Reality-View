import { useEffect, useRef, useState, useCallback } from 'react';
import { RealityView } from '../three/RealityView.js';

const TEMPERATURE_F = 68;
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

const INITIAL_HUD = {
  mph: 0,
  range: 212,
  battery: 68,
  tripDist: 1.3,
  tripMinutes: 7,
  now: Date.now(),
};

function TopBar({ hud }) {
  return (
    <div id="topbar">
      <div className="tb-left">
        <div className="hud-item"><span className="dot" /><span>PRN</span></div>
        <div className="hud-item"><span>{hud.range}</span><span style={{ fontSize: 11 }}>mi</span></div>
        <div className="hud-item"><span className="big">{hud.mph}<span className="unit">MPH</span></span></div>
        <div className="hud-item"><span className="gear">D</span></div>
      </div>
      <div className="hud-item">
        <span>{timeFormat.format(hud.now).toLowerCase()}</span>
        <span className="dot warn" />
        <span>{TEMPERATURE_F}°F</span>
      </div>
    </div>
  );
}

function NavPanel() {
  return (
    <div id="navpanel">
      <div className="nav-row">
        <div className="nav-turn right">↑</div>
        <div>
          <div className="nav-street">Shelter Island Dr</div>
          <div className="nav-dist">0.1 mi · 右转</div>
        </div>
        <div className="speed-limit">30</div>
      </div>
    </div>
  );
}

function TripCard({ hud, onEndTrip }) {
  const tripTime = timeFormat.format(hud.now + hud.tripMinutes * 60_000).toLowerCase();
  return (
    <div id="tripcard">
      <div className="trip-head"><span className="trip-time">{tripTime}</span><span className="trip-dest">Home</span></div>
      <div className="trip-line"><span>{hud.tripMinutes} min</span><span className="val">{hud.tripDist.toFixed(1)} mi</span></div>
      <div className="trip-btn" onClick={onEndTrip}>End Trip</div>
      <div className="battery"><div className="battery-fill" style={{ width: `${hud.battery.toFixed(1)}%` }} /></div>
      <div id="batlabel"><span>电池</span><span>{Math.round(hud.battery)}%</span></div>
    </div>
  );
}

function MediaBar() {
  return (
    <div id="mediabar">
      <div className="media-art" />
      <div className="media-info">
        <div className="media-title">Eshghe Man</div>
        <div className="media-artist">Moin</div>
      </div>
      <div className="media-controls">
        <div className="media-btn">⏮</div>
        <div className="media-btn play">▶</div>
        <div className="media-btn">⏭</div>
        <div className="media-btn">⟲</div>
        <div className="media-btn">🔍</div>
      </div>
    </div>
  );
}

function BottomRow() {
  const items = [
    { icon: '🚗', label: 'Car' },
    null, // 温度单独渲染
    { icon: '🪑', label: 'Seat' },
    { icon: '📞', label: 'Phone' },
    { icon: '🟢', label: 'Music' },
    { icon: '🎵', label: 'Media' },
    'sep',
    { icon: '📱', label: 'Apps' },
    { icon: '🔊', label: 'Vol' },
  ];
  return (
    <div id="bottomrow">
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="sep" />;
        if (it === null) {
          return (
            <div className="bottom-item" key={i}>
              <div className="icon">🌡</div>
              <div className="temp">{TEMPERATURE_F}°F</div>
            </div>
          );
        }
        return (
          <div className="bottom-item" key={i}>
            <div className="icon">{it.icon}</div>
            <div className="label">{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function RealityViewPage() {
  const stageRef = useRef(null);
  const viewRef = useRef(null);
  const [hud, setHud] = useState(INITIAL_HUD);
  const [paused, setPaused] = useState(false);
  const [topdown, setTopdown] = useState(false);
  const [tripEnded, setTripEnded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const view = new RealityView(stageRef.current, setHud);
    viewRef.current = view;
    setReady(true);
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  const togglePause = useCallback(() => {
    setPaused(prev => {
      const next = !prev;
      viewRef.current?.setPaused(next);
      return next;
    });
  }, []);

  const toggleTopdown = useCallback(() => {
    setTopdown(prev => {
      const next = !prev;
      viewRef.current?.setTopdown(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 't' || e.key === 'T') toggleTopdown();
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, toggleTopdown]);

  const endTrip = useCallback(() => {
    setTripEnded(true);
    setTimeout(() => setTripEnded(false), 2200);
  }, []);

  return (
    <>
      <div id="stage" ref={stageRef} />
      <div id="hud">
        <TopBar hud={hud} />
        <NavPanel />
        <div id="midmode">{tripEnded ? '行程已结束' : 'Driving Home'}</div>
        <TripCard hud={hud} onEndTrip={endTrip} />
        <MediaBar />
        <BottomRow />
      </div>
      <div id="toolbar">
        <button className={topdown ? 'active' : ''} onClick={toggleTopdown}>
          车顶俯视 <span className="kbd">T</span>
        </button>
        <button className={paused ? 'active' : ''} onClick={togglePause}>
          {paused ? '继续' : '暂停'} <span className="kbd">空格</span>
        </button>
      </div>
      <div id="info">{ready ? '拖动旋转视角 · 滚轮缩放' : '正在生成 3D 环境…'}</div>
    </>
  );
}
