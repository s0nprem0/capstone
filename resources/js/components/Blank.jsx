// An empty field, said in a word. A bare dash is read aloud as "em dash".
export default function Blank({ children = 'None' }) {
  return <span className="text-muted">{children}</span>
}
