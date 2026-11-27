import { NavLink } from 'react-router-dom';

export default function TopNav() {
  return (
    <nav id="topnav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        Reality View
      </NavLink>
      <NavLink to="/about" className={({ isActive }) => (isActive ? 'active' : '')}>
        About
      </NavLink>
    </nav>
  );
}
