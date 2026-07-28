export type PublicCompanyIdentity = {
  tradingName: string
  legalName: string | null
  companyNumber: string | null
  registeredOffice: string | null
  vatNumber: string | null
  completeForPayments: boolean
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Public legal identity for trust pages and footers.
 *
 * Do not invent company details. Configure these values before paid launch:
 * STARLIZ_LEGAL_NAME, STARLIZ_COMPANY_NUMBER, STARLIZ_REGISTERED_OFFICE
 * and, when applicable, STARLIZ_VAT_NUMBER.
 */
export function getPublicCompanyIdentity(): PublicCompanyIdentity {
  const legalName = clean(process.env.STARLIZ_LEGAL_NAME)
  const companyNumber = clean(process.env.STARLIZ_COMPANY_NUMBER)
  const registeredOffice = clean(process.env.STARLIZ_REGISTERED_OFFICE)

  return {
    tradingName: "StarLiz Academy",
    legalName,
    companyNumber,
    registeredOffice,
    vatNumber: clean(process.env.STARLIZ_VAT_NUMBER),
    completeForPayments: Boolean(legalName && companyNumber && registeredOffice),
  }
}
