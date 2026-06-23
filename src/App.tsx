import { Routes, Route, Navigate } from 'react-router-dom'
import Layout         from '@/components/layout/Layout'
import Dashboard      from '@/components/modules/Dashboard'
import Clients        from '@/components/modules/Clients'
import Portfolios     from '@/components/modules/Portfolios'
import Properties     from '@/components/modules/Properties'
import PropertyDetail from '@/components/modules/PropertyDetail'
import PropertyMap    from '@/components/modules/PropertyMap'
import Billing        from '@/components/modules/Billing'
import MarketSearch   from '@/components/modules/MarketSearch'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="clients"        element={<Clients />} />
        <Route path="portfolios"     element={<Portfolios />} />
        <Route path="properties"     element={<Properties />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="map"            element={<PropertyMap />} />
        <Route path="billing"        element={<Billing />} />
        <Route path="market"         element={<MarketSearch />} />
      </Route>
    </Routes>
  )
}
