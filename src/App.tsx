import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChartPie, Funnel, HandCoins, House, Info, Landmark, ListOrdered, PiggyBank, Plus, Repeat, Search, Settings, Split, Tags, Target,
  Wallet, Zap, type LucideIcon,
} from 'lucide-react';
import { db, type Tx } from './db';
import { processRecurring } from './lib/automation';
import { getSettings, setSettings, useSettings } from './lib/format';
import { checkAlerts } from './lib/notify';
import { AppCtx, DialogHost, Logo, showToast, ToastHost, type Fab } from './components/ui';
import { TxForm } from './components/TxForm';
import { CalcPill } from './components/CalcPill';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { Reports } from './pages/Reports';
import { Connect } from './pages/Automation';
import { SilentAdd } from './pages/SilentAdd';
import { Welcome } from './pages/Welcome';
import { About } from './pages/About';
import { Accounts, Assets, Categories, Goals, Loans, RecurringPage, SettingsPage, Splits, Tags as TagsPage } from './pages/More';

type NavItem = readonly [to: string, label: string, icon: LucideIcon];

const TABS: readonly NavItem[] = [
  ['/', 'Home', House],
  ['/search', 'Activity', ListOrdered],
  ['/reports', 'Reports', ChartPie],
  ['/accounts', 'Accounts', Wallet],
];

const SIDE: readonly (readonly [string, readonly NavItem[]])[] = [
  ['Library', TABS],
  ['Plan', [['/budgets', 'Budgets', PiggyBank], ['/goals', 'Goals', Target], ['/recurring', 'Recurring', Repeat]]],
  ['Money', [['/loans', 'Loans', HandCoins], ['/split', 'Bill Splitter', Split], ['/assets', 'Assets', Landmark], ['/tags', 'Labels', Tags]]],
  ['Automate', [['/connect', 'Banks & SMS', Zap]]],
];

const THEME_BG = { light: '#f6f1ed', dark: '#130d0b' } as const;

function Sidebar() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <aside className="side" aria-label="Main">
      <Link to="/" className="brand"><span className="logo"><Logo /></span><span>Khata</span></Link>
      <form className="side-search" role="search" onSubmit={(e) => (e.preventDefault(), navigate(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`))}>
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder="Search" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <nav className="side-nav">
        {SIDE.map(([group, links]) => (
          <div key={group} className="side-group">
            <div className="side-label">{group}</div>
            {links.map(([to, label, Icon]) => (
              <NavLink key={to} to={to} end={to === '/'}><Icon size={20} aria-hidden="true" /><span>{label}</span></NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-group side-bottom">
        <NavLink to="/settings"><Settings size={20} aria-hidden="true" /><span>Preferences</span></NavLink>
        <NavLink to="/about"><Info size={20} aria-hidden="true" /><span>About</span></NavLink>
      </div>
    </aside>
  );
}

export function App() {
  const s = useSettings();
  const [tx, setTx] = useState<Partial<Tx> | null>(null);
  const [fab, setFab] = useState<Fab>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isTab = TABS.some(([to]) => to === pathname);
  const bare = pathname === '/welcome' || pathname === '/silent_add';
  const showFab = pathname !== '/settings' && pathname !== '/about';

  const toast = useCallback(showToast, []);
  const ctx = useMemo(() => ({ editTx: (t: Partial<Tx> = {}) => setTx(t), toast, setFab, dock }), [toast, dock]);

  useEffect(() => {
    const root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.theme);
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      const own = m.media.includes('dark') ? THEME_BG.dark : THEME_BG.light;
      m.content = s.theme === 'system' ? own : THEME_BG[s.theme];
    });
  }, [s.theme]);

  // first run: people who already have data skip the welcome flow
  useEffect(() => {
    if (getSettings().onboarded || pathname === '/silent_add') return;
    db.txs.count().then((n) => (n ? setSettings({ onboarded: true }) : navigate('/welcome', { replace: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // post due recurring items on launch and whenever the app comes back to the foreground
  const running = useRef(false);
  useEffect(() => {
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const n = await processRecurring();
        if (n) toast(`Posted ${n} recurring transaction${n > 1 ? 's' : ''}`);
      } finally {
        running.current = false;
      }
      checkAlerts();
    };
    run();
    const id = setInterval(checkAlerts, 10 * 60e3);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => (clearInterval(id), document.removeEventListener('visibilitychange', onVisible));
  }, [toast]);

  // the app shortcut, home-screen links and the daily reminder open /?add=1
  useEffect(() => {
    if (params.get('add')) {
      setTx({});
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app ${bare ? 'bare' : ''}`}>
        {!bare && <Sidebar />}
        <main className="main">
          <div className="page" key={pathname}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/search" element={<Transactions />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/recurring" element={<RecurringPage />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/automation" element={<Navigate to="/connect" replace />} />
              <Route path="/silent_add" element={<SilentAdd />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/about" element={<About />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/tags" element={<TagsPage />} />
              <Route path="/split" element={<Splits />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      {!bare && (
        <div className="dock">
          <div className="dock-in">
            <div className="dock-slot" ref={setDock}>
              {isTab && (
                <nav className="tabbar" aria-label="Tabs">
                  {TABS.map(([to, label, Icon]) => (
                    <NavLink key={to} to={to} end>
                      <Icon size={22} aria-hidden="true" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>
            {showFab && (
              <button className="fab" key={fab?.icon ?? 'tx'} aria-label={fab?.icon === 'filter' ? 'Filter' : fab ? 'Add' : 'Add transaction'} onClick={fab?.run ?? (() => setTx({}))}>
                {fab?.icon === 'filter' ? <Funnel size={22} aria-hidden="true" /> : <Plus size={28} strokeWidth={2.4} aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      )}
      <CalcPill />
      {tx && <TxForm key={tx.id ?? 'new'} initial={tx} onClose={() => setTx(null)} />}
      <ToastHost />
      <DialogHost />
    </AppCtx.Provider>
  );
}
