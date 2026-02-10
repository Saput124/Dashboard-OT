import { useState, useEffect } from 'react'
import { Calendar, Users, Clock, AlertCircle, Eye, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateRotationSchedule, saveRotationSchedule, formatDate, getDayName } from '../utils/rotation'
import type { JenisOvertime, Pekerja } from '../types'

export default function RotationPlan() {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [jenisOvertimeList, setJenisOvertimeList] = useState<JenisOvertime[]>([])
  const [pekerjaList, setPekerjaList] = useState<Pekerja[]>([])
  const [generatedSchedule, setGeneratedSchedule] = useState<any[]>([])
  const [savedPlans, setSavedPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'generate'>('list')

  useEffect(() => {
    fetchData()
    fetchSavedPlans()
  }, [])

  const fetchData = async () => {
    const [jenisOT, pekerja] = await Promise.all([
      supabase.from('jenis_overtime').select('*'),
      supabase.from('pekerja').select('*').eq('aktif', true)
    ])

    if (jenisOT.data) setJenisOvertimeList(jenisOT.data)
    if (pekerja.data) setPekerjaList(pekerja.data)
  }

  const fetchSavedPlans = async () => {
    const { data } = await supabase
      .from('rencana_overtime')
      .select(`
        *,
        jenis_overtime (nama, durasi_jam),
        pekerja_rencana (
          id,
          pekerja (nama)
        )
      `)
      .order('tanggal', { ascending: true })
      .limit(100)

    if (data) {
      // Group by date
      const grouped = data.reduce((acc: any, item: any) => {
        if (!acc[item.tanggal]) {
          acc[item.tanggal] = []
        }
        acc[item.tanggal].push(item)
        return acc
      }, {})
      setSavedPlans(Object.entries(grouped).map(([tanggal, plans]) => ({ tanggal, plans })))
    }
  }

  const handleGenerate = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const schedules = await generateRotationSchedule(
        new Date(startDate),
        15,
        jenisOvertimeList,
        pekerjaList
      )
      setGeneratedSchedule(schedules)
      setMessage('Jadwal berhasil dibuat! Silakan review sebelum menyimpan.')
    } catch (error) {
      setMessage('Error generating schedule: ' + error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    
    try {
      const result = await saveRotationSchedule(generatedSchedule)
      if (result.success) {
        setMessage('Jadwal berhasil disimpan!')
        setGeneratedSchedule([])
        fetchSavedPlans()
        setActiveTab('list')
      } else {
        setMessage('Error menyimpan jadwal')
      }
    } catch (error) {
      setMessage('Error: ' + error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePlan = async (tanggal: string) => {
    if (!confirm(`Hapus semua rencana untuk tanggal ${formatDate(tanggal)}?`)) return
    
    try {
      const { error } = await supabase
        .from('rencana_overtime')
        .delete()
        .eq('tanggal', tanggal)
      
      if (error) throw error
      setMessage('Rencana berhasil dihapus')
      fetchSavedPlans()
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    }
  }

  const groupByDate = (schedules: any[]) => {
    const grouped: { [key: string]: any[] } = {}
    schedules.forEach(schedule => {
      if (!grouped[schedule.tanggal]) {
        grouped[schedule.tanggal] = []
      }
      grouped[schedule.tanggal].push(schedule)
    })
    return grouped
  }

  const groupedSchedules = groupByDate(generatedSchedule)

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'list'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Eye className="w-5 h-5" />
            Daftar Rencana
          </button>
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'generate'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calendar className="w-5 h-5" />
            Generate Baru
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-start gap-2 ${
          message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
        }`}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p>{message}</p>
        </div>
      )}

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <div className="card">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Generate Rencana Rotasi Lembur
          </h2>

          <div className="space-y-4">
            <div>
              <label className="label">Tanggal Mulai</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || !startDate}
                className="btn-primary disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Jadwal 15 Hari'}
              </button>

              {generatedSchedule.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-success disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              )}
            </div>
          </div>

          {generatedSchedule.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-4">Preview Jadwal</h3>
              <div className="space-y-4">
                {Object.entries(groupedSchedules).map(([tanggal, schedules]) => {
                  const isSunday = schedules[0].is_minggu
                  return (
                    <div
                      key={tanggal}
                      className={`border rounded-lg p-4 ${
                        isSunday ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">
                            {formatDate(tanggal)}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {getDayName(tanggal)} {isSunday && '(Hari Minggu)'}
                          </p>
                        </div>
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                          Grup {schedules[0].grup_rotasi}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {schedules.map((schedule: any, idx: number) => (
                          <div key={idx} className="bg-gray-50 rounded p-3 border border-gray-200">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h5 className="font-medium text-gray-900">
                                  {schedule.jenis_overtime.nama}
                                </h5>
                                <p className="text-sm text-gray-600">
                                  {schedule.jenis_overtime.keterangan}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 text-sm text-gray-700">
                                <Clock className="w-4 h-4" />
                                {schedule.durasi_jam} jam
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                              <Users className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-700">
                                {schedule.assigned_pekerja.length} pekerja:
                              </span>
                              <span className="text-gray-600">
                                {schedule.assigned_pekerja.map((p: Pekerja) => p.nama).join(', ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card bg-blue-50 border border-blue-200 mt-6">
            <h3 className="font-semibold mb-2 text-blue-900">Informasi Rotasi</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Rotasi dilakukan setiap 3 hari sekali</li>
              <li>• Total 3 grup pekerja yang bergiliran</li>
              <li>• Hari Minggu ditandai dengan warna kuning</li>
              <li>• Setiap jenis overtime memiliki alokasi pekerja yang berbeda</li>
            </ul>
          </div>
        </div>
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-xl font-bold mb-4">Rencana yang Tersimpan</h3>
            {savedPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>Belum ada rencana tersimpan</p>
                <p className="text-sm">Klik tab "Generate Baru" untuk membuat rencana</p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedPlans.map(({ tanggal, plans }: any) => (
                  <PlanCard
                    key={tanggal}
                    tanggal={tanggal}
                    plans={plans}
                    onDelete={() => handleDeletePlan(tanggal)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PlanCard({ tanggal, plans, onDelete }: any) {
  const [stats, setStats] = useState<any>(null)
  
  useEffect(() => {
    fetchStats()
  }, [tanggal])
  
  const fetchStats = async () => {
    const { data } = await supabase
      .from('aktual_overtime')
      .select('dilaksanakan, sesuai_rencana')
      .eq('tanggal', tanggal)
    
    if (data && data.length > 0) {
      const total = data.length
      const hadir = data.filter((d: any) => d.dilaksanakan).length
      const sesuai = data.filter((d: any) => d.sesuai_rencana).length
      setStats({ total, hadir, sesuai })
    }
  }
  
  const isSunday = plans[0]?.is_minggu
  const isPast = new Date(tanggal) < new Date(new Date().setHours(0, 0, 0, 0))
  
  return (
    <div className={`border rounded-lg p-4 ${
      isSunday ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-lg">{formatDate(tanggal)}</h4>
          <p className="text-sm text-gray-600">
            {getDayName(tanggal)} - Grup {plans[0]?.grup_rotasi}
          </p>
          {stats && (
            <div className="mt-2 flex gap-3 text-sm">
              <span className="text-green-700">✓ {stats.hadir}/{stats.total} Hadir</span>
              <span className="text-blue-700">✓ {stats.sesuai}/{stats.total} Sesuai</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {stats && (
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              Sudah Input
            </span>
          )}
          {!stats && isPast && (
            <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
              Belum Input
            </span>
          )}
          <button onClick={onDelete} className="text-red-600 hover:text-red-800">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        {plans.map((plan: any) => (
          <div key={plan.id} className="bg-white bg-opacity-60 rounded p-3 border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h5 className="font-medium">{plan.jenis_overtime?.nama}</h5>
                <p className="text-sm text-gray-600">
                  {plan.pekerja_rencana?.length || 0} pekerja • {plan.durasi_jam} jam
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}