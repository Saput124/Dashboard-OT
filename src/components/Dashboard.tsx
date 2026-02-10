import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Users, Calendar, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/rotation'
import { startOfWeek, endOfWeek, format } from 'date-fns'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPekerja: 0,
    rencanaMingguIni: 0,
    aktualMingguIni: 0,
    compliance: 0
  })
  const [recentActuals, setRecentActuals] = useState<any[]>([])
  const [upcomingPlans, setUpcomingPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)

    try {
      // Total pekerja aktif
      const { count: pekerjaCount } = await supabase
        .from('pekerja')
        .select('*', { count: 'exact', head: true })
        .eq('aktif', true)

      // Rencana minggu ini
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })

      const { count: rencanaCount } = await supabase
        .from('rencana_overtime')
        .select('*', { count: 'exact', head: true })
        .gte('tanggal', format(weekStart, 'yyyy-MM-dd'))
        .lte('tanggal', format(weekEnd, 'yyyy-MM-dd'))

      // Aktual minggu ini
      const { count: aktualCount } = await supabase
        .from('aktual_overtime')
        .select('*', { count: 'exact', head: true })
        .gte('tanggal', format(weekStart, 'yyyy-MM-dd'))
        .lte('tanggal', format(weekEnd, 'yyyy-MM-dd'))

      // Compliance rate
      const { data: complianceData } = await supabase
        .from('aktual_overtime')
        .select('sesuai_rencana')
        .gte('tanggal', format(weekStart, 'yyyy-MM-dd'))
        .lte('tanggal', format(weekEnd, 'yyyy-MM-dd'))

      let complianceRate = 0
      if (complianceData && complianceData.length > 0) {
        const sesuai = complianceData.filter(d => d.sesuai_rencana).length
        complianceRate = Math.round((sesuai / complianceData.length) * 100)
      }

      // Recent actuals
      const { data: recentData } = await supabase
        .from('aktual_overtime')
        .select(`
          *,
          pekerja (*),
          rencana_overtime (
            *,
            jenis_overtime (*)
          )
        `)
        .order('tanggal', { ascending: false })
        .limit(10)

      // Upcoming plans
      const { data: upcomingData } = await supabase
        .from('rencana_overtime')
        .select(`
          *,
          jenis_overtime (*)
        `)
        .gte('tanggal', format(new Date(), 'yyyy-MM-dd'))
        .order('tanggal', { ascending: true })
        .limit(10)

      setStats({
        totalPekerja: pekerjaCount || 0,
        rencanaMingguIni: rencanaCount || 0,
        aktualMingguIni: aktualCount || 0,
        compliance: complianceRate
      })

      if (recentData) setRecentActuals(recentData)
      if (upcomingData) setUpcomingPlans(upcomingData)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-600">Memuat data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Dashboard Overtime</h2>
        <p className="text-gray-600">Overview dan statistik sistem rotasi lembur</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Total Pekerja Aktif</p>
              <p className="text-3xl font-bold">{stats.totalPekerja}</p>
            </div>
            <Users className="w-12 h-12 text-blue-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Rencana Minggu Ini</p>
              <p className="text-3xl font-bold">{stats.rencanaMingguIni}</p>
            </div>
            <Calendar className="w-12 h-12 text-green-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm mb-1">Aktual Minggu Ini</p>
              <p className="text-3xl font-bold">{stats.aktualMingguIni}</p>
            </div>
            <Clock className="w-12 h-12 text-purple-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm mb-1">Compliance Rate</p>
              <p className="text-3xl font-bold">{stats.compliance}%</p>
            </div>
            <TrendingUp className="w-12 h-12 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Plans */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Rencana Mendatang
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {upcomingPlans.length === 0 ? (
              <p className="text-gray-500 text-sm">Belum ada rencana overtime</p>
            ) : (
              upcomingPlans.map(plan => (
                <div key={plan.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{plan.jenis_overtime?.nama}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDate(plan.tanggal)} - Grup {plan.grup_rotasi}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                        {plan.durasi_jam} jam
                      </span>
                      {plan.is_minggu && (
                        <span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium ml-1">
                          Minggu
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Actuals */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Aktual Terbaru
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentActuals.length === 0 ? (
              <p className="text-gray-500 text-sm">Belum ada data aktual</p>
            ) : (
              recentActuals.map(actual => (
                <div key={actual.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{actual.pekerja?.nama}</h4>
                      <p className="text-sm text-gray-600">
                        {actual.rencana_overtime?.jenis_overtime?.nama}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(actual.tanggal)}
                      </p>
                    </div>
                    <div className="text-right">
                      {actual.dilaksanakan ? (
                        <>
                          <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                            {actual.durasi_aktual || 0} jam
                          </span>
                          {!actual.sesuai_rencana && (
                            <span className="block bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium mt-1">
                              Tidak sesuai
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
                          Tidak hadir
                        </span>
                      )}
                    </div>
                  </div>
                  {actual.keterangan && (
                    <p className="text-xs text-gray-600 mt-2 italic">
                      "{actual.keterangan}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}