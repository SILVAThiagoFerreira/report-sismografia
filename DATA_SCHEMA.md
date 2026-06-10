# DATA_SCHEMA.md

## CSV de Entrada

Cada CSV deve conter uma linha por ponto monitorado. O cabeçalho pode usar nomes em português ou inglês, mas os campos abaixo são os esperados.

### Campos principais

- `location`
- `client`
- `user_name`
- `serial_number`
- `battery_level`
- `unit_calibration`
- `file_name`
- `scaled_distance`
- `distance_m`
- `charge_kg`
- `event_date`
- `pspl_db_l`
- `microphone_zc_freq_hz`
- `peak_vector_sum_mm_s`
- `tran_ppv_mm_s`
- `tran_zc_freq_hz`
- `vert_ppv_mm_s`
- `vert_zc_freq_hz`
- `long_ppv_mm_s`
- `long_zc_freq_hz`
- `pspl_compliant`

## Normalização

- Campos numéricos aceitam vírgula ou ponto decimal.
- Datas aceitam `YYYY-MM-DD`, `DD/MM/YYYY` ou `YYYY/MM/DD`.
- Campos vazios são tratados como ausência e apresentados como `N/D`.

## JSON de Saída

O export JSON preserva os registros consolidados, incluindo os valores normalizados.

```json
{
  "generated_at": "2026-06-10T12:00:00-03:00",
  "source_files": [],
  "records": []
}
```

## `records[]`

Cada item contém:

- `source_file`
- `location`
- `client`
- `user_name`
- `serial_number`
- `battery_level`
- `unit_calibration`
- `file_name`
- `scaled_distance`
- `distance_m`
- `charge_kg`
- `event_date`
- `pspl_db_l`
- `microphone_zc_freq_hz`
- `peak_vector_sum_mm_s`
- `channels`
- `pspl_compliant`

## `channels[]`

- `axis`
- `ppv_mm_s`
- `zc_freq_hz`
- `reference_limit_mm_s`
- `compliant`

