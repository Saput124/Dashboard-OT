import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, CalendarPlus, ClipboardCheck, Settings, Trophy, Sun } from 'lucide-react'
import Dashboard from './components/Dashboard'
import RotationPlan from './components/RotationPlan'
import ActualInput from './components/ActualInput'
import Management from './components/Management'
import RankingPerforma from './components/RankingPerforma'
import JadwalLibur from './components/JadwalLibur'

function Navigation() {
  const location = useLocation()
  
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/rotation', icon: CalendarPlus, label: 'Rencana Rotasi' },
    { path: '/libur', icon: Sun, label: 'Jadwal Libur' },
    { path: '/actual', icon: ClipboardCheck, label: 'Input Aktual' },
    { path: '/ranking', icon: Trophy, label: 'Ranking' },
    { path: '/management', icon: Settings, label: 'Management' },
  ]

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">
              Sistem Rotasi Overtime
            </h1>
          </div>
          <div className="flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rotation" element={<RotationPlan />} />
            <Route path="/libur" element={<JadwalLibur />} />
            <Route path="/actual" element={<ActualInput />} />
            <Route path="/ranking" element={<RankingPerforma />} />
            <Route path="/management" element={<Management />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App