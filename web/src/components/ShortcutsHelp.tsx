import * as Dialog from '@radix-ui/react-dialog';

const ROWS: [string, string][] = [
  ['n', 'New entry in current session'],
  ['p', 'Add a player (host)'],
  ['r', 'Rebuy for selected player'],
  ['c', 'Cash out selected player'],
  ['v', 'Verify selected entry (host)'],
  ['x', 'Reject selected entry (host)'],
  ['/', 'Focus search'],
  ['↑ ↓', 'Move row selection'],
  ['Enter', 'Open / confirm selected row'],
  ['Esc', 'Cancel edit / close dialog'],
  ['?', 'This reference'],
];

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">Keyboard shortcuts</Dialog.Title>
          <Dialog.Description className="sr-only">
            Global keyboard shortcuts for the ledger
          </Dialog.Description>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {ROWS.map(([key, action]) => (
                <tr key={key} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1 pr-3">
                    <kbd className="rounded border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 text-xs">
                      {key}
                    </kbd>
                  </td>
                  <td className="py-1 text-neutral-600">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-neutral-400">
            Verification is per entry, on purpose — there is no verify-all.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
