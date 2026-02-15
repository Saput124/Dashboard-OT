import { useState, useEffect } from 'react'
import { Calendar, Users, Clock, AlertCircle, Eye, Trash2, CheckSquare, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateRotationSchedule, saveRotationSchedule, formatDate, getDayName } from '../utils/rotation'
import { differenceInDays } from 'date-fns'
import type { JenisOvertime, Pekerja } from '../types'

export default function RotationPlan() {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [jenisOvertimeList, setJenisOvertimeList] = useState<JenisOvertime[]>([])
  const [pekerjaList, setPekerjaList] = useState<Pekerja[]>([])
  const [selectedPekerjaIds, setSelectedPekerjaIds] = useState<string[]>([])
  const [selectedOvertimeIds, setSelectedOvertimeIds] = useState<string[]>([])
  const [generatedSchedule, setGeneratedSchedule] = useState<any[]>([])
  const [savedPlans, setSavedPlans] = useState<any[]>([])
  const [workloadPreview, setWorkloadPreview] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'generate'>('list')
  const [excludeWeekends, setExcludeWeekends] = useState(true)
  const [intervalDays, setIntervalDays] = useState(4) // Rotasi setiap berapa hari

  const totalDays = startDate && endDate ? differenceInDays(new Date(endDate), new Date(startDate)) + 1 : 0

  useEffect(() => {
    fetchData()
    fetchSavedPlans()
  }, [])

  useEffect(() => {
    // Auto-select all by default
    if (pekerjaList.length > 0 && selectedPekerjaIds.length === 0) {
      setSelectedPekerjaIds(pekerjaList.map(p => p.id))
    }
    if (jenisOvertimeList.length > 0 && selectedOvertimeIds.length === 0) {
      setSelectedOvertimeIds(jenisOvertimeList.map(ot => ot.id))
    }
  }, [pekerjaList, jenisOvertimeList])

  const fetchData = async () => {
    const [jenisOT, pekerja] = await Promise.all([
      supabase.from('jenis_overtime').select('*').order('nama', { ascending: true }),
      supabase.from('pekerja').select('*').eq('aktif', true).order('nama', { ascending: true })
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
    if (selectedPekerjaIds.length === 0) {
      setMessage('Error: Pilih minimal 1 pekerja')
      return
    }
    if (selectedOvertimeIds.length === 0) {
      setMessage('Error: Pilih minimal 1 jenis overtime')
      return
    }
    if (!startDate || !endDate) {
      setMessage('Error: Pilih tanggal mulai dan selesai')
      return
    }
    if (new Date(endDate) < new Date(startDate)) {
      setMessage('Error: Tanggal selesai harus lebih besar dari tanggal mulai')
      return
    }

    setLoading(true)
    setMessage('')
    
    try {
      // Fix timezone issue: parse date properly
      const parseDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number)
        return new Date(year, month - 1, day, 12, 0, 0) // Noon to avoid timezone issues
      }
      
      const schedules = await generateRotationSchedule(
        {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          selectedPekerjaIds,
          selectedOvertimeIds,
          intervalDays,
          excludeWeekends,
          maxHoursPerDay: 7
        },
        jenisOvertimeList,
        pekerjaList
      )
      setGeneratedSchedule(schedules)
      calculateWorkloadPreview(schedules)
      setMessage(`Jadwal berhasil dibuat! Total ${totalDays} hari. Silakan review distribusi beban kerja sebelum menyimpan.`)
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateWorkloadPreview = (schedules: any[]) => {
    const workload: { [pekerjaId: string]: { nama: string, totalJam: number, jumlahTugas: number } } = {}
    
    schedules.forEach(schedule => {
      schedule.assigned_pekerja.forEach((p: Pekerja) => {
        if (!workload[p.id]) {
          workload[p.id] = { nama: p.nama, totalJam: 0, jumlahTugas: 0 }
        }
        workload[p.id].totalJam += schedule.durasi_jam
        workload[p.id].jumlahTugas += 1
      })
    })

    const preview = Object.entries(workload)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalJam - a.totalJam)
    
    setWorkloadPreview(preview)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    
    try {
      console.log('Saving schedules:', generatedSchedule.length)
      console.log('First schedule:', generatedSchedule[0])
      console.log('Last schedule:', generatedSchedule[generatedSchedule.length - 1])
      
      const result = await saveRotationSchedule(generatedSchedule)
      
      if (result.success) {
        setMessage('✅ Jadwal berhasil disimpan!')
        setGeneratedSchedule([])
        setWorkloadPreview([])
        
        // Fetch saved plans with error handling
        setTimeout(async () => {
          try {
            await fetchSavedPlans()
          } catch (err) {
            console.error('Error fetching saved plans:', err)
            // Don't show error to user, just log it
          }
        }, 500)
        
        setActiveTab('list')
      } else {
        setMessage('❌ Error menyimpan jadwal: ' + (result.error || 'Unknown error'))
        console.error('Save error:', result.error)
      }
    } catch (error: any) {
      setMessage('❌ Error: ' + (error.message || error))
      console.error('Save exception:', error)
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

  const togglePekerja = (id: string) => {
    setSelectedPekerjaIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleOvertime = (id: string) => {
    setSelectedOvertimeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleAllPekerja = () => {
    if (selectedPekerjaIds.length === pekerjaList.length) {
      setSelectedPekerjaIds([])
    } else {
      setSelectedPekerjaIds(pekerjaList.map(p => p.id))
    }
  }

  const toggleAllOvertime = () => {
    if (selectedOvertimeIds.length === jenisOvertimeList.length) {
      setSelectedOvertimeIds([])
    } else {
      setSelectedOvertimeIds(jenisOvertimeList.map(ot => ot.id))
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
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Calendar className="w-6 h-6" />
              Generate Rencana Rotasi Lembur
            </h2>

            <div className="space-y-6">
              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="label">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label">Tanggal Selesai</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label">Rotasi Setiap (Hari)</label>
                  <select
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value))}
                    className="input-field"
                    title="Kelompok yang sama bekerja bersama setiap X hari, lalu ganti"
                  >
                    <option value={1}>1 Hari</option>
                    <option value={2}>2 Hari</option>
                    <option value={3}>3 Hari</option>
                    <option value={4}>4 Hari (Rekomendasi)</option>
                    <option value={5}>5 Hari</option>
                    <option value={6}>6 Hari</option>
                    <option value={7}>7 Hari</option>
                  </select>
                </div>
                <div>
                  <label className="label">Total Hari</label>
                  <div className="input-field bg-gray-50 flex items-center justify-center font-semibold text-blue-600">
                    {totalDays > 0 ? `${totalDays} hari` : '-'}
                  </div>
                </div>
              </div>

              {/* Worker Selection */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Pilih Pekerja ({selectedPekerjaIds.length}/{pekerjaList.length})
                  </h3>
                  <button
                    onClick={toggleAllPekerja}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {selectedPekerjaIds.length === pekerjaList.length ? (
                      <>
                        <Square className="w-4 h-4" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-4 h-4" />
                        Select All
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                  {pekerjaList.map(pekerja => (
                    <label
                      key={pekerja.id}
                      className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPekerjaIds.includes(pekerja.id)}
                        onChange={() => togglePekerja(pekerja.id)}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm truncate" title={pekerja.nama}>{pekerja.nama}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Overtime Type Selection */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Pilih Jenis Overtime ({selectedOvertimeIds.length}/{jenisOvertimeList.length})
                  </h3>
                  <button
                    onClick={toggleAllOvertime}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {selectedOvertimeIds.length === jenisOvertimeList.length ? (
                      <>
                        <Square className="w-4 h-4" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-4 h-4" />
                        Select All
                      </>
                    )}
                  </button>
                </div>
                <div className="space-y-2">
                  {jenisOvertimeList.map(overtime => (
                    <label
                      key={overtime.id}
                      className="flex items-start gap-3 p-3 hover:bg-white rounded cursor-pointer border border-transparent hover:border-blue-200"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOvertimeIds.includes(overtime.id)}
                        onChange={() => toggleOvertime(overtime.id)}
                        className="mt-1 rounded text-blue-600"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{overtime.nama}</div>
                        <div className="text-sm text-gray-600">
                          {overtime.alokasi_pekerja} pekerja • {overtime.durasi_jam} jam • {overtime.keterangan}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Weekend & Interval Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                {/* Skip Weekends Checkbox */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="excludeWeekends"
                    checked={excludeWeekends}
                    onChange={(e) => setExcludeWeekends(e.target.checked)}
                    className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="excludeWeekends" className="cursor-pointer flex-1">
                    <div className="font-semibold text-gray-900 mb-1">🗓️ Skip Minggu & Tanggal Merah</div>
                    <div className="text-sm text-gray-700 leading-relaxed">
                      {excludeWeekends ? (
                        <span className="text-green-700 font-medium">
                          ✓ Hanya generate untuk hari kerja (Senin-Sabtu kecuali tanggal merah)
                        </span>
                      ) : (
                        <span className="text-orange-700 font-medium">
                          ✗ Generate untuk semua hari termasuk Minggu & tanggal merah
                        </span>
                      )}
                    </div>
                  </label>
                </div>

                {/* Interval Days Display */}
                <div className="bg-white bg-opacity-60 rounded-lg p-3 border border-blue-200">
                  <div className="font-semibold text-gray-900 mb-1">🔄 Interval Rotasi</div>
                  <div className="text-sm text-gray-700">
                    Kelompok yang sama bertugas selama <span className="font-bold text-blue-600">{intervalDays} hari</span> berturut-turut sebelum rotasi
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={loading || selectedPekerjaIds.length === 0 || selectedOvertimeIds.length === 0}
                  className="btn-primary disabled:opacity-50"
                >
                  {loading ? 'Generating...' : `Generate Jadwal (${totalDays} hari)`}
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
          </div>

          {/* Workload Preview */}
          {workloadPreview.length > 0 && (
            <div className="card bg-blue-50 border border-blue-200">
              <h3 className="font-semibold mb-4 text-blue-900">Preview Distribusi Beban Kerja</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {workloadPreview.map((item) => {
                  const avgJam = (item.totalJam / totalDays).toFixed(1)
                  const isBalanced = item.totalJam >= workloadPreview[workloadPreview.length - 1].totalJam * 0.8
                  
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${
                        isBalanced ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="font-medium text-sm">{item.nama}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Total: <span className="font-semibold">{item.totalJam} jam</span> ({item.jumlahTugas} tugas)
                      </div>
                      <div className="text-xs text-gray-600">
                        Rata-rata: <span className="font-semibold">{avgJam} jam/hari</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-sm text-blue-700 mt-3">
                ℹ️ <strong>Hijau</strong> = Distribusi seimbang, <strong>Kuning</strong> = Beban lebih ringan dari yang lain
              </p>
            </div>
          )}

          {/* Generated Schedule Preview */}
          {generatedSchedule.length > 0 && (
            <div className="card">
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

          <div className="card bg-blue-50 border border-blue-200">
            <h3 className="font-semibold mb-2 text-blue-900">Informasi Algoritma</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Kelompok yang sama bekerja bersama setiap <strong>{intervalDays} hari</strong>, lalu ganti</li>
              <li>• <strong>Skip otomatis</strong>: Hari Minggu & tanggal merah (Imlek, Lebaran, dll)</li>
              <li>• <strong>Distribusi berdasarkan JAM OT</strong>: Bukan cuma jumlah hari, tapi total jam lembur</li>
              <li>• <strong>Auto-Balance</strong>: Pekerja yang kurang jam OT akan di-replace ke periode terakhir</li>
              <li>• <strong>Contoh</strong>: 16-28 Feb → Skip 17 Feb (Imlek), 22 Feb (Minggu) → Sisa 11 hari kerja</li>
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