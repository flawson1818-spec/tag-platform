import { Route, Routes, Link, Navigate } from 'react-router-dom';
import { TagsPage } from './tags/TagsPage';
import { ItemsPage } from './items/ItemsPage';

export function App() {
  return (
    <div className="app">
      <header>
        <h1>Tag Platform</h1>
        <nav>
          <Link to="/tags">Tags</Link>
          <Link to="/items">Items</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/tags" replace />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/items" element={<ItemsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
