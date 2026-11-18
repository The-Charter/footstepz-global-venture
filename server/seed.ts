/**
 * Adds a few sample listings so a fresh shop is not empty.
 * Run once with `bun run seed`. Delete them any time from the admin page.
 */
import { parseUsdc } from '../src/onchain-money'
import { migrate, sql } from './db'

const shoe = (body: string, sole: string, accent: string, bg: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
<rect width="600" height="450" fill="${bg}"/>
<ellipse cx="300" cy="372" rx="215" ry="16" fill="#122d45" opacity="0.12"/>
<path d="M92 300c0-40 14-86 38-96l50-20c14-6 24-18 30-34l8-22c3-8 14-10 20-4l56 54c14 14 34 22 54 22h88c46 0 86 26 86 70v36c0 8-6 14-14 14H112c-12 0-20-8-20-20z" fill="${body}"/>
<path d="M215 156l46 46c12 12 30 18 48 18" stroke="${accent}" stroke-width="10" stroke-linecap="round" fill="none"/>
<path d="M243 128l40 40M268 148l36 36M292 168l32 32" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
<path d="M92 322h430c0 34-12 46-30 46H118c-18 0-26-14-26-46z" fill="${sole}"/>
<path d="M150 300c40 18 120 24 190 12" stroke="${accent}" stroke-width="12" stroke-linecap="round" fill="none"/>
</svg>`

const samples = [
  { name: 'Lagos Runner', category: 'Sneakers', price: '45', sizes: ['40', '41', '42', '43', '44'], svg: shoe('#122d45', '#ffffff', '#ff9d3d', '#f5f1ea') },
  { name: 'Abuja Oxford', category: 'Formal', price: '60', sizes: ['41', '42', '43', '44', '45'], svg: shoe('#5b3a29', '#2a1a12', '#c89a6c', '#f2ece4') },
  { name: 'Sunday Slide', category: 'Sandals', price: '18', sizes: ['38', '39', '40', '41', '42', '43'], svg: shoe('#1a8047', '#f5f5f8', '#ffffff', '#eef4ee') },
  { name: 'Terrain Boot', category: 'Boots', price: '75', sizes: ['40', '41', '42', '43', '44', '45'], svg: shoe('#6b6580', '#1b1b24', '#ffd24a', '#f0eff5') },
]

await migrate()
const [{ count }] = await sql`SELECT count(*)::int AS count FROM products`
if (Number(count) > 0) {
  console.log('Products already exist, skipping seed.')
  process.exit(0)
}
for (const s of samples) {
  await sql`INSERT INTO products (name, category, price_raw, sizes, image, image_type)
    VALUES (${s.name}, ${s.category}, ${parseUsdc(s.price).toString()}, ${JSON.stringify(s.sizes)}, ${Buffer.from(s.svg)}, ${'image/svg+xml'})`
}
console.log(`Seeded ${samples.length} sample listings.`)
process.exit(0)
