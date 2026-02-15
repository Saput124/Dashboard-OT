import { useState, useEffect } from 'react'
import { Trophy, TrendingUp, TrendingDown, Award } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, format, startOfMonth, endOfMonth } from 'date-fns'

export default function RankingPerforma() {
  const [rankings, setRankings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

  useEffect(() => {
    fetchRanking()
  }, [selectedMonth])

  const fetchRanking = async () => {
    setLoading(true)
    
    // Parse selected month
    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = startOfMonth(new Date(year, month - 1))
    const endDate = endOfMonth(new Date(year, month - 1))
    
    const startDateStr = format(startDate, 'yyyy-MM-dd')
    const endDateStr = format(endDate, 'yyyy-MM-dd')

    // Fetch all pekerja
    const { data: pekerjaData } = await supabase
      .from('pekerja')
      .select('id, nama, nik')
      .order('nama')

    if (!pekerjaData) {
      setLoading(false)
      return
    }

    // Fetch rencana overtime (expected)
    const { data: rencanaData } = await supabase
      .from('pekerja_rencana')
      .select(`
        pekerja_id,
        rencana_overtime (
          tanggal,
          durasi_jam
        )
      `)
      .gte('rencana_overtime.tanggal', startDateStr)
      .lte('rencana_overtime.tanggal', endDateStr)

    // Fetch aktual overtime
    const { data: aktualData } = await supabase
      .from('aktual_overtime')
      .select('pekerja_id, tanggal, dilaksanakan, durasi_aktual')
      .gte('tanggal', startDateStr)
      .lte('tanggal', endDateStr)

    // Calculate stats per pekerja
    const stats = pekerjaData.map(pekerja => {
      // Count rencana (expected)
      const rencanaList = rencanaData?.filter(r => r.pekerja_id === pekerja.id) || []
      const totalRencana = rencanaList.reduce((sum, r: any) => {
        return sum + (r.rencana_overtime?.durasi_jam || 0)
      }, 0)

      // Count aktual (actual)
      const aktualList = aktualData?.filter(a => a.pekerja_id === pekerja.id) || []
      const totalAktual = aktualList.reduce((sum, a) => {
        if (a.dilaksanakan) {
          return sum + (a.durasi_aktual || 0)
        }
        return sum
      }, 0)
      
      const jumlahHadir = aktualList.filter(a => a.dilaksanakan).length
      const jumlahTidakHadir = aktualList.filter(a => !a.dilaksanakan).length

      // Calculate performance percentage
      const persentase = totalRencana > 0 ? (totalAktual / totalRencana) * 100 : 0

      // Determine kategori
      let kategori = 'Kurang'
      let badgeColor = 'bg-red-100 text-red-800 border-red-300'
      let icon = TrendingDown
      
      if (persentase >= 90) {
        kategori = 'Optimal'
        badgeColor = 'bg-green-100 text-green-800 border-green-300'
        icon = Trophy
      } else if (persentase >= 70) {
        kategori = 'Baik'
        badgeColor = 'bg-blue-100 text-blue-800 border-blue-300'
        icon = TrendingUp
      }

      return {
        pekerja,
        totalRencana,
        totalAktual,
        jumlahHadir,
        jumlahTidakHadir,
        persentase: Math.round(persentase),
        kategori,
        badgeColor,
        icon
      }
    })

    // Filter only those who have rencana, then sort by persentase
    const filtered = stats
      .filter(s => s.totalRencana > 0)
      .sort((a, b) => b.persentase - a.persentase)

    setRankings(filtered)
    setLoading(false)
  }

  // Group by kategori
  const optimal = rankings.filter(r => r.kategori === 'Optimal')
  const baik = rankings.filter(r => r.kategori === 'Baik')
  const kurang = rankings.filter(r => r.kategori === 'Kurang')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-8 h-8 text-yellow-500" />
          <div>
            <h2 className="text-2xl font-bold">Ranking Performa Pekerja</h2>
            <p className="text-sm text-gray-600">Berdasarkan kehadiran overtime aktual</p>
          </div>
        </div>
        <div>
          <label className="label">Pilih Bulan</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <Trophy className="w-10 h-10 text-green-600" />
            <div>
              <div className="text-3xl font-bold text-green-700">{optimal.length}</div>
              <div className="text-sm text-green-600">Optimal (≥90%)</div>
            </div>
          </div>
        </div>

        <div className="card bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-blue-600" />
            <div>
              <div className="text-3xl font-bold text-blue-700">{baik.length}</div>
              <div className="text-sm text-blue-600">Baik (70-89%)</div>
            </div>
          </div>
        </div>

        <div className="card bg-red-50 border border-red-200">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-10 h-10 text-red-600" />
            <div>
              <div className="text-3xl font-bold text-red-700">{kurang.length}</div>
              <div className="text-sm text-red-600">Kurang {'(<70%)'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ranking List */}
      {loading ? (
        <div className="card text-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      ) : rankings.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-gray-500">Tidak ada data untuk bulan ini</div>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="p-3 text-left">Rank</th>
                  <th className="p-3 text-left">Nama Pekerja</th>
                  <th className="p-3 text-center">Rencana (Jam)</th>
                  <th className="p-3 text-center">Aktual (Jam)</th>
                  <th className="p-3 text-center">Hadir / Tidak</th>
                  <th className="p-3 text-center">Persentase</th>
                  <th className="p-3 text-center">Kategori</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((rank, index) => {
                  const Icon = rank.icon
                  return (
                    <tr key={rank.pekerja.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {index === 0 && <Trophy className="w-5 h-5 text-yellow-500" />}
                          {index === 1 && <Trophy className="w-5 h-5 text-gray-400" />}
                          {index === 2 && <Trophy className="w-5 h-5 text-orange-400" />}
                          <span className="font-bold text-lg">#{index + 1}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{rank.pekerja.nama}</div>
                        <div className="text-xs text-gray-500">{rank.pekerja.nik}</div>
                      </td>
                      <td className="p-3 text-center font-semibold">{rank.totalRencana}j</td>
                      <td className="p-3 text-center font-semibold">{rank.totalAktual}j</td>
                      <td className="p-3 text-center">
                        <span className="text-green-600 font-semibold">{rank.jumlahHadir}</span>
                        {' / '}
                        <span className="text-red-600 font-semibold">{rank.jumlahTidakHadir}</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="text-2xl font-bold">{rank.persentase}%</div>
                      </td>
                      <td className="p-3 text-center">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border font-semibold ${rank.badgeColor}`}>
                          <Icon className="w-4 h-4" />
                          {rank.kategori}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card bg-gray-50">
        <h3 className="font-semibold mb-3">Kategori Performa:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-green-600" />
            <span><strong>Optimal:</strong> ≥90% kehadiran (sangat baik)</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <span><strong>Baik:</strong> 70-89% kehadiran (cukup baik)</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <span><strong>Kurang:</strong> {'<70%'} kehadiran (perlu ditingkatkan)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
