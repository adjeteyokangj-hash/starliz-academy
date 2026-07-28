import { getPublicCompanyIdentity } from "@/lib/public-company"

type CompanyIdentityProps = {
  compact?: boolean
}

export default function CompanyIdentity({ compact = false }: CompanyIdentityProps) {
  const company = getPublicCompanyIdentity()

  if (!company.completeForPayments) {
    return (
      <p className={compact ? "text-xs text-slate-500" : "text-sm leading-6 text-slate-400"}>
        StarLiz Academy is the trading name used for this service. Legal entity, company
        registration and registered office details must be published here before paid
        subscriptions open.
      </p>
    )
  }

  return (
    <div className={compact ? "text-xs text-slate-500" : "text-sm leading-6 text-slate-400"}>
      <p>{company.tradingName} is operated by {company.legalName}.</p>
      <p>Company number: {company.companyNumber}</p>
      <p>Registered office: {company.registeredOffice}</p>
      {company.vatNumber ? <p>VAT number: {company.vatNumber}</p> : null}
    </div>
  )
}
