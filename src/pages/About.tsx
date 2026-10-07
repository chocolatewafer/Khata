import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { PALETTE } from '../lib/icons';
import { List, Logo, Row, Screen } from '../components/ui';
import '../styles/screens-b.css';

const GitHubMark = () => (
  <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const POINTS = [
  ['shield', PALETTE.green, 'Private by design', 'No account, no server, no tracking. Your ledger lives in this browser and nowhere else.'],
  ['wifi', PALETTE.blue, 'Works offline', 'Install it once and it opens without a connection, like any app.'],
  ['zap', PALETTE.orange, 'Reads your alerts', 'Paste or forward bank and wallet SMS from India and Nepal. Khata fills in the rest.'],
] as const;

export function About() {
  return (
    <Screen title="About" back className="sb">
      <section className="card sb-about-hero rise">
        <span className="logo sb-about-logo"><Logo /></span>
        <h2 className="t-title1">Khata</h2>
        <p className="t-subhead secondary">Version {__APP_VERSION__}</p>
        <p className="t-body sb-about-tag">
          <i>Khata</i> (खाता) is the ledger book every shop keeps. This one is for you: a calm, no-nonsense expense tracker that takes
          seconds a day.
        </p>
      </section>

      <List>
        {POINTS.map(([icon, color, title, body]) => (
          <Row key={title} icon={icon} color={color} iconSize="md" title={title} subtitle={body} className="sb-wrap" />
        ))}
      </List>

      <a className="tinted-card sb-maker" href="https://github.com/chocolatewafer" target="_blank" rel="noreferrer">
        <span className="sb-maker-ic"><GitHubMark /></span>
        <span className="sb-maker-body">
          <span className="t-footnote secondary">Made by</span>
          <span className="t-title3">Chocolate Wafer</span>
          <span className="t-subhead accent">github.com/chocolatewafer</span>
        </span>
        <ExternalLink size={18} className="tertiary" aria-hidden="true" />
      </a>

      <List header="Credits">
        <div className="sb-credits t-footnote secondary">
          <p>
            Inspired by <a className="accent" href="https://paisa-tracker.app" target="_blank" rel="noreferrer">Paisa</a> by Hemanth Savarala.
            Built with React, Dexie (IndexedDB) and Lucide icons. Set in the system font, with Inter where it isn't available.
          </p>
          <p>No data ever leaves your device. Back up or restore in <Link className="accent" to="/settings">Preferences</Link>.</p>
        </div>
      </List>
    </Screen>
  );
}
