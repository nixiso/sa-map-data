// Candidate source-attribute names for each identity field. The official
// dataset's field names aren't guaranteed to stay exactly as they are
// today, so callers resolve through these lists rather than hardcoding
// e.g. "CAT_B" directly (spec: identifier is the entity key, name/province
// are display properties).
const NAME_FIELDS = ["MUNICNAME", "MunicName", "LOCAL_MUNI", "NAME", "name"];
const CODE_FIELDS = ["MUNICCODE", "MunicCode", "CAT_B", "CODE", "code"];
const PROVINCE_FIELDS = ["PROVINCE", "Province", "PROVNAME", "province"];

function firstPresent(
  props: Record<string, unknown>,
  candidates: string[],
): string | undefined {
  for (const key of candidates) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== "") {
      return String(props[key]);
    }
  }
  return undefined;
}

export function getMunicipalityName(props: Record<string, unknown>): string | undefined {
  return firstPresent(props, NAME_FIELDS);
}

export function getMunicipalityCode(props: Record<string, unknown>): string | undefined {
  return firstPresent(props, CODE_FIELDS);
}

export function getMunicipalityProvince(props: Record<string, unknown>): string | undefined {
  return firstPresent(props, PROVINCE_FIELDS);
}
