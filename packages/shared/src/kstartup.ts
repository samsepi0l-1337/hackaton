// K-Startup `getAnnouncementInformation02` 응답 → Program. 실제 응답 형식은 키 발급 후 확인한다.
import type { Program } from './types';

export interface KStartupItem {
  pbanc_sn: string | number;
  biz_pbanc_nm: string;
  pbanc_ntrp_nm?: string;
  supt_biz_clsfc?: string;
  supt_regin?: string;
  pbanc_rcpt_bgng_dt?: string; // 'YYYYMMDD' 로 예상
  pbanc_rcpt_end_dt?: string;
  rcrt_prgs_yn?: string;
  aply_trgt?: string;
  biz_enyy?: string;
  biz_trgt_age?: string;
  pbanc_ctnt?: string;
  support_ctnt?: string;
  detl_pg_url?: string;
  intg_pbanc_biz_nm?: string;
  sprv_inst?: string;
  biz_prch_dprt_nm?: string;
  biz_gdnc_url?: string;
  biz_aply_url?: string;
  prch_cnpl_no?: string;
  aply_trgt_ctnt?: string;
  prfn_matr?: string;
  aply_excl_trgt_ctnt?: string;
  aply_mthd_onli_rcpt_istc?: string;
  aply_mthd_eml_rcpt_istc?: string;
  aply_mthd_vst_rcpt_istc?: string;
  aply_mthd_pssr_rcpt_istc?: string;
  aply_mthd_fax_rcpt_istc?: string;
  aply_mthd_etc_istc?: string;
  eval_method?: string;
  intg_pbanc_yn?: string;
}

/** 'yyyyMMdd', 'yyyy-MM-dd', 시각이 붙은 값을 모두 'YYYY-MM-DD' 로 바꾼다. 읽을 수 없으면 null. */
export function toIso(v: string | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : null;
}

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function fromKStartup(item: KStartupItem, tags: string[] = []): Program {
  const start = toIso(item.pbanc_rcpt_bgng_dt);
  return {
    id: String(item.pbanc_sn),
    title: item.biz_pbanc_nm,
    agency: item.pbanc_ntrp_nm ?? '',
    category: item.supt_biz_clsfc ?? '',
    region: blank(item.supt_regin),
    startDate: start,
    endDate: toIso(item.pbanc_rcpt_end_dt),
    recruiting: item.rcrt_prgs_yn !== 'N',
    target: blank(item.aply_trgt),
    bizYears: blank(item.biz_enyy),
    targetAge: blank(item.biz_trgt_age),
    content: item.support_ctnt ?? item.pbanc_ctnt ?? '',
    url: item.detl_pg_url ?? '',
    registeredAt: start ?? '1970-01-01',
    tags,
  };
}
