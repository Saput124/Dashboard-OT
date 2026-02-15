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
  const [intervalDays, setIntervalDays] = useState(4)
  
  // ⭐ NEW: Sunday Schedule States
  const [generateSundaySchedule, setGenerateSundaySchedule] = useState(false)
  const [selectedSundayOvertimeIds, setSelectedSundayOvertimeIds] = useState<string[]>([])

  const totalDays = startDate && endDate ? differenceInDays(new Date(endDate), new Date(startDate)) + 1 : 0

  useEffect(() => {
    fetchData()
    fetchSavedPlans()
  }, [])

  useEffect(() => {
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
    
    // ⭐ NEW: Validate Sunday schedule
    if (generateSundaySchedule && selectedSundayOvertimeIds.length === 0) {
      setMessage('Error: Pilih minimal 1 jenis overtime untuk hari Minggu')
      return
    }

    setLoading(true)
    setMessage('')
    
    try {
      const parseDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number)
        return new Date(year, month - 1, day, 12, 0, 0)
      }
      
      const schedules = await generateRotationSchedule(
        {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          selectedPekerjaIds,
          selectedOvertimeIds,
          intervalDays,
          excludeWeekends,
          maxHoursPerDay: 2,
          // ⭐ NEW: Sunday options
          generateSundaySchedule,
          sundayOvertimeIds: selectedSundayOvertimeIds
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
      const result = await saveRotationSchedule(generatedSchedule)
      
      if (result.success) {
        setMessage('✅ Jadwal berhasil disimpan!')
        setGeneratedSchedule([])
        setWorkloadPreview([])
        
        setTimeout(async () => {
          try {
            await fetchSavedPlans()
          } catch (err) {
            console.error('Error fetching saved plans:', err)
          }
        }, 500)
        
        setActiveTab('list')
      } else {
        setMessage('❌ Error menyimpan jadwal: ' + (result.error || 'Unknown error'))
      }
    } catch (error: any) {
      setMessage('❌ Error: ' + (error.message || error))
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

  const selectAllPekerja = () => {
    setSelectedPekerjaIds(pekerjaList.map(p => p.id))
  }

  const deselectAllPekerja = () => {
    setSelectedPekerjaIds([])
  }

  const selectAllOvertime = () => {
    setSelectedOvertimeIds(jenisOvertimeList.map(ot => ot.id))
  }

  const deselectAllOvertime = () => {
    setSelectedOvertimeIds([])
  }

  const groupedSchedules = generatedSchedule.reduce((acc: any, schedule) => {
    if (!acc[schedule.tanggal]) {
      acc[schedule.tanggal] = []
    }
    acc[schedule.tanggal].push(schedule)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Calendar className="w-7 h-7" />
          Rencana Rotasi Lembur
        </h2>
        <p className="text-gray-600">Buat dan kelola jadwal rotasi overtime otomatis</p>
      </div>

      <div className="flex gap-4 border-b-2 border-gray-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`pb-3 px-4 font-semibold transition-colors ${
            activeTab === 'list'
              ? 'border-b-4 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Eye className="w-4 h-4 inline mr-2" />
          Daftar Rencana
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          className={`pb-3 px-4 font-semibold transition-colors ${
            activeTab === 'generate'
              ? 'border-b-4 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Generate Baru
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.includes('Error') || message.includes('❌')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {activeTab === 'generate' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-xl font-bold mb-4">Pengaturan Jadwal</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="excludeWeekends"
                  checked={excludeWeekends}
                  onChange={(e) => setExcludeWeekends(e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 rounded"
                />
                <label htmlFor="excludeWeekends" className="cursor-pointer flex-1">
                  <div className="font-semibold text-gray-900">Skip Minggu & Tanggal Merah</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {excludeWeekends ? (
                      <span className="text-green-600">
                        ✓ Hanya generate untuk hari kerja (Senin-Sabtu kecuali tanggal merah)
                      </span>
                    ) : (
                      <span className="text-orange-600">
                        ✗ Generate untuk semua hari termasuk Minggu & tanggal merah
                      </span>
                    )}
                  </div>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-gray-900 mb-2">
                  Interval Rotasi
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={intervalDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (val >= 1 && val <= 7) {
                        setIntervalDays(val)
                      }
                    }}
                    className="input-field w-20 text-center font-bold text-lg"
                  />
                  <span className="text-sm text-gray-600">
                    hari berturut-turut
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Kelompok pekerja yang sama akan bertugas selama {intervalDays} hari berturut-turut sebelum rotasi
                </div>
              </div>
            </div>

            {/* ⭐ NEW: Sunday Schedule Section */}
            <div className="border-2 border-purple-200 rounded-lg p-5 bg-gradient-to-br from-purple-50 to-indigo-50 mt-4 shadow-sm">
              <div className="flex items-start gap-4 mb-4">
                <input
                  type="checkbox"
                  id="generateSundaySchedule"
                  checked={generateSundaySchedule}
                  onChange={(e) => {
                    setGenerateSundaySchedule(e.target.checked)
                    if (!e.target.checked) {
                      setSelectedSundayOvertimeIds([])
                    }
                  }}
                  className="mt-1 w-6 h-6 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                />
                <label htmlFor="generateSundaySchedule" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2 font-bold text-lg text-purple-900">
                    <span>🗓️</span>
                    <span>Generate Jadwal Khusus Hari Minggu</span>
                  </div>
                  <div className="text-sm mt-2">
                    {generateSundaySchedule ? (
                      <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                        <span className="font-bold text-lg">✓</span>
                        <span className="font-medium">
                          Aktif - Akan generate jadwal khusus untuk hari Minggu (durasi berbeda dari hari kerja)
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                        <span className="font-bold text-lg">✗</span>
                        <span>
                          Nonaktif - Hari Minggu akan kosong
                        </span>
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {generateSundaySchedule && (
                <div className="mt-5 pt-5 border-t-2 border-purple-300">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-lg text-purple-900 flex items-center gap-2">
                        <span>📋</span>
                        <span>Pilih Jenis Overtime untuk Hari Minggu</span>
                      </h4>
                      <p className="text-sm text-purple-700 mt-1">
                        Pilih jenis OT yang akan digunakan khusus untuk hari Minggu (biasanya durasi lebih lama, mis: 7 jam)
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedSundayOvertimeIds.length}
                      </div>
                      <div className="text-xs text-purple-700">dipilih</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto bg-white rounded-xl p-4 border-2 border-purple-200 shadow-inner">
                    {jenisOvertimeList.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="text-4xl mb-2">📝</div>
                        <div className="text-gray-600 font-medium">Tidak ada jenis overtime</div>
                        <div className="text-sm text-gray-500 mt-1">
                          Buat jenis overtime baru di menu <strong>Management</strong>
                        </div>
                      </div>
                    ) : (
                      jenisOvertimeList.map(overtime => {
                        const isSelected = selectedSundayOvertimeIds.includes(overtime.id)
                        
                        return (
                          <label
                            key={overtime.id}
                            className={`
                              flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200
                              ${isSelected 
                                ? 'bg-gradient-to-r from-purple-100 to-indigo-100 border-2 border-purple-500 shadow-md transform scale-[1.02]' 
                                : 'bg-gray-50 border-2 border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:shadow-sm'
                              }
                            `}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSundayOvertimeIds([...selectedSundayOvertimeIds, overtime.id])
                                } else {
                                  setSelectedSundayOvertimeIds(selectedSundayOvertimeIds.filter(id => id !== overtime.id))
                                }
                              }}
                              className="mt-1 w-5 h-5 rounded text-purple-600 focus:ring-2 focus:ring-purple-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-lg text-gray-900">{overtime.nama}</div>
                                {isSelected && (
                                  <div className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                                    DIPILIH
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-sm">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-600">⏱️</span>
                                  <span className="font-bold text-purple-700">{overtime.durasi_jam} jam</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-600">👥</span>
                                  <span className="font-semibold text-gray-700">{overtime.alokasi_pekerja} pekerja</span>
                                </div>
                              </div>
                              {overtime.keterangan && (
                                <div className="mt-2 text-sm text-gray-600 italic">
                                  {overtime.keterangan}
                                </div>
                              )}
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>

                  {jenisOvertimeList.length > 0 && selectedSundayOvertimeIds.length === 0 && (
                    <div className="mt-3 flex items-start gap-3 text-sm text-orange-700 bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <div className="font-bold">Belum ada jenis overtime yang dipilih</div>
                        <div className="mt-1">Pilih minimal 1 jenis overtime untuk hari Minggu sebelum generate</div>
                      </div>
                    </div>
                  )}

                  {selectedSundayOvertimeIds.length > 0 && (
                    <div className="mt-3 flex items-start gap-3 text-sm text-green-700 bg-green-50 p-4 rounded-lg border-2 border-green-200">
                      <span className="text-xl">✅</span>
                      <div>
                        <div className="font-bold">
                          {selectedSundayOvertimeIds.length} jenis overtime dipilih untuk hari Minggu
                        </div>
                        <div className="mt-1">
                          Jadwal akan di-generate untuk semua hari Minggu dalam periode yang dipilih
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border-2 border-blue-200">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">💡</span>
                      <div className="flex-1">
                        <div className="font-bold text-blue-900 mb-2">Tips Penggunaan:</div>
                        <ul className="text-sm text-blue-800 space-y-1">
                          <li>• Buat jenis OT khusus dengan durasi lebih panjang (mis: 7 jam) di menu <strong>Management</strong></li>
                          <li>• Anda bisa memilih multiple jenis OT untuk Minggu (misal: Lightrap + Maintenance)</li>
                          <li>• Pekerja yang dapat jadwal Minggu akan di-rotasi secara fair berdasarkan beban kerja</li>
                          <li>• Jadwal Minggu TIDAK terkena batasan "Max 2 jam per hari" (bisa 7 jam sekaligus)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="label">Pilih Pekerja ({selectedPekerjaIds.length} dipilih)</label>
                <div className="flex gap-2">
                  <button onClick={selectAllPekerja} className="text-sm text-blue-600 hover:text-blue-800">
                    Pilih Semua
                  </button>
                  <button onClick={deselectAllPekerja} className="text-sm text-red-600 hover:text-red-800">
                    Hapus Semua
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-3 bg-gray-50 rounded-lg border border-gray-200">
                {pekerjaList.map(pekerja => (
                  <label
                    key={pekerja.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPekerjaIds.includes(pekerja.id)}
                      onChange={() => togglePekerja(pekerja.id)}
                      className="rounded text-blue-600"
                    />
                    <span>{pekerja.nama}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="label">Pilih Jenis Overtime Hari Kerja ({selectedOvertimeIds.length} dipilih)</label>
                <div className="flex gap-2">
                  <button onClick={selectAllOvertime} className="text-sm text-blue-600 hover:text-blue-800">
                    Pilih Semua
                  </button>
                  <button onClick={deselectAllOvertime} className="text-sm text-red-600 hover:text-red-800">
                    Hapus Semua
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto p-3 bg-gray-50 rounded-lg border border-gray-200">
                {jenisOvertimeList.map(overtime => (
                  <label
                    key={overtime.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedOvertimeIds.includes(overtime.id)
                        ? 'bg-blue-100 border-2 border-blue-400'
                        : 'bg-white border-2 border-transparent hover:border-blue-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedOvertimeIds.includes(overtime.id)}
                      onChange={() => toggleOvertime(overtime.id)}
                      className="mt-1 rounded text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{overtime.nama}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">{overtime.durasi_jam} jam</span>
                        {' • '}
                        {overtime.alokasi_pekerja} pekerja per hari
                        {overtime.keterangan && ` • ${overtime.keterangan}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || selectedPekerjaIds.length === 0 || selectedOvertimeIds.length === 0}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating...' : `Generate Jadwal (${totalDays} hari)`}
              </button>

              {generatedSchedule.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-success disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              )}
            </div>
          </div>

          {workloadPreview.length > 0 && (
            <div className="card">
              <h3 className="text-xl font-bold mb-4">Distribusi Beban Kerja</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {workloadPreview.map(item => {
                  const avgJam = (item.totalJam / item.jumlahTugas).toFixed(1)
                  const targetJam = (generatedSchedule.reduce((sum, s) => sum + (s.durasi_jam * s.assigned_pekerja.length), 0) / selectedPekerjaIds.length)
                  const isBalanced = item.totalJam >= targetJam * 0.8
                  
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
            </div>
          )}

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
              <li>• <strong>Jadwal Minggu Khusus</strong>: Bisa set OT durasi berbeda untuk hari Minggu (mis: 7 jam)</li>
            </ul>
          </div>
        </div>
      )}

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