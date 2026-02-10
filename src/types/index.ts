export interface Pekerja {
  id: string
  nama: string
  nip: string
  aktif: boolean
  created_at: string
}

export interface JenisOvertime {
  id: string
  nama: string
  alokasi_pekerja: number
  durasi_jam: number
  keterangan?: string
  created_at: string
}

export interface RencanaOvertime {
  id: string
  tanggal: string
  jenis_overtime_id: string
  grup_rotasi: number
  is_minggu: boolean
  durasi_jam: number
  created_at: string
  jenis_overtime?: JenisOvertime
  pekerja_list?: Pekerja[]
}

export interface PekerjaRencana {
  id: string
  rencana_overtime_id: string
  pekerja_id: string
  created_at: string
  pekerja?: Pekerja
}

export interface AktualOvertime {
  id: string
  rencana_overtime_id: string
  pekerja_id: string
  tanggal: string
  dilaksanakan: boolean
  durasi_aktual?: number
  sesuai_rencana: boolean
  keterangan?: string
  created_at: string
  pekerja?: Pekerja
  rencana_overtime?: RencanaOvertime
}
