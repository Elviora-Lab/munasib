'use client';

import { useState, useTransition } from 'react';
import {
  Ban,
  ClipboardList,
  FileDown,
  MapPinPlus,
  PackageSearch,
  ReceiptText,
  Search,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  addPostExPickupAddress,
  bulkLookupPostExTracking,
  cancelPostExByTracking,
  lookupPostExAdvice,
  lookupPostExPayment,
  lookupPostExTracking,
  searchPostExOrders,
  searchPostExUnbookedOrders,
  submitPostExShipperAdvice,
} from '@/server/actions/admin/postex.actions';
import { type PostExPickupAddress } from '@/server/shipping/postex';

type Result = unknown;

export function PostExDashboardClient({
  configured,
  today,
  pickupAddresses,
}: {
  configured: boolean;
  today: string;
  pickupAddresses: PostExPickupAddress[];
}) {
  const [pending, start] = useTransition();
  const [resultTitle, setResultTitle] = useState('Results');
  const [result, setResult] = useState<Result>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingNumbers, setTrackingNumbers] = useState('');
  const [pickupAddress, setPickupAddress] = useState(pickupAddresses[0]?.address ?? '');

  function show(title: string, data: Result) {
    setResultTitle(title);
    setResult(data);
  }

  function run<T>(
    title: string,
    task: () => Promise<{ success: true; data: T } | { success: false; message: string }>,
  ) {
    start(async () => {
      const res = await task();
      if (res.success) {
        show(title, res.data);
        toast.success(title);
      } else {
        toast.error(res.message);
      }
    });
  }

  const openPdf = (kind: 'label' | 'load-sheet') => {
    const list = trackingNumbers || trackingNumber;
    const numbers = list
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!numbers.length) {
      toast.error('Add at least one tracking number');
      return;
    }
    if (kind === 'label' && numbers.length > 200) {
      toast.error('Too many tracking numbers for labels (max 200)');
      return;
    }
    const params = new URLSearchParams({ tracking: numbers.join(',') });
    if (kind === 'load-sheet' && pickupAddress.trim()) {
      params.set('pickupAddress', pickupAddress.trim());
    }
    window.open(
      `/api/v1/admin/postex/${kind}?${params.toString()}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  if (!configured) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-4 text-sm text-muted-foreground">
          PostEx is not configured in this runtime. Add the production token and pickup address code
          in hosting environment variables, then redeploy.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader>
          <CardTitle>PostEx tools</CardTitle>
          <CardDescription>
            Run live merchant API checks without exposing the token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="tracking">
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="tracking">Tracking</TabsTrigger>
              <TabsTrigger value="lists">Lists</TabsTrigger>
              <TabsTrigger value="pickup">Pickup</TabsTrigger>
              <TabsTrigger value="advice">Advice</TabsTrigger>
            </TabsList>

            <TabsContent value="tracking" className="space-y-5">
              <Field label="Tracking number">
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="CX-XXXXXXXXXXX"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={pending}
                  onClick={() =>
                    run('Tracking detail', () => lookupPostExTracking({ trackingNumber }))
                  }
                >
                  <Search /> Track
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  onClick={() => run('COD payment', () => lookupPostExPayment({ trackingNumber }))}
                >
                  <ReceiptText /> COD
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPdf('label')}>
                  <FileDown /> Airway bill
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => {
                    if (!confirm(`Cancel PostEx booking ${trackingNumber}?`)) return;
                    run('Booking cancelled', () => cancelPostExByTracking({ trackingNumber }));
                  }}
                >
                  <Ban /> Cancel
                </Button>
              </div>

              <Field label="Bulk tracking numbers">
                <textarea
                  value={trackingNumbers}
                  onChange={(e) => setTrackingNumbers(e.target.value)}
                  placeholder="Paste tracking numbers separated by commas or lines"
                  rows={5}
                  className="w-full rounded-md border border-input bg-transparent px-3.5 py-2 text-sm focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </Field>
              <Field label="Pickup address for load sheet">
                <Input
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="Optional pickup address"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  onClick={() =>
                    run('Bulk tracking', () => bulkLookupPostExTracking({ trackingNumbers }))
                  }
                >
                  <PackageSearch /> Bulk track
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPdf('label')}>
                  <FileDown /> Batch airway bill
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPdf('load-sheet')}>
                  <ClipboardList /> Load sheet
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="lists" className="space-y-5">
              <OrderListForm today={today} pending={pending} run={run} />
            </TabsContent>

            <TabsContent value="pickup" className="space-y-5">
              <PickupForm pending={pending} run={run} />
            </TabsContent>

            <TabsContent value="advice" className="space-y-5">
              <AdviceForm
                pending={pending}
                trackingNumber={trackingNumber}
                setTrackingNumber={setTrackingNumber}
                run={run}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{resultTitle}</CardTitle>
          <CardDescription>Latest response from PostEx.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResultView value={result} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function OrderListForm({
  today,
  pending,
  run,
}: {
  today: string;
  pending: boolean;
  run: <T>(
    title: string,
    task: () => Promise<{ success: true; data: T } | { success: false; message: string }>,
  ) => void;
}) {
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [orderStatusID, setOrderStatusID] = useState('0');
  const [cityName, setCityName] = useState('');

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="From">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Status ID">
          <Input
            type="number"
            min={0}
            value={orderStatusID}
            onChange={(e) => setOrderStatusID(e.target.value)}
          />
        </Field>
      </div>
      <Field label="City for unbooked orders">
        <Input
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
          placeholder="Optional"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            run('PostEx orders', () =>
              searchPostExOrders({ orderStatusID: Number(orderStatusID), fromDate, toDate }),
            )
          }
        >
          <Search /> List orders
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() =>
            run('Unbooked orders', () =>
              searchPostExUnbookedOrders({ startDate: fromDate, endDate: toDate, cityName }),
            )
          }
        >
          <ClipboardList /> Unbooked
        </Button>
      </div>
    </>
  );
}

function PickupForm({
  pending,
  run,
}: {
  pending: boolean;
  run: <T>(
    title: string,
    task: () => Promise<{ success: true; data: T } | { success: false; message: string }>,
  ) => void;
}) {
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      action={(formData) => {
        run('Pickup address created', () =>
          addPostExPickupAddress({
            address: String(formData.get('address') ?? ''),
            addressTypeId: Number(formData.get('addressTypeId')) as 1 | 2,
            cityName: String(formData.get('cityName') ?? ''),
            contactPersonName: String(formData.get('contactPersonName') ?? ''),
            phone1: String(formData.get('phone1') ?? ''),
            phone2: String(formData.get('phone2') ?? ''),
            phone3: String(formData.get('phone3') ?? ''),
            wareHouseManagerName: String(formData.get('wareHouseManagerName') ?? ''),
          }),
        );
      }}
    >
      <Field label="Address">
        <Input name="address" required className="md:col-span-2" />
      </Field>
      <Field label="Type">
        <select
          name="addressTypeId"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="2">Pickup</option>
          <option value="1">Return</option>
        </select>
      </Field>
      <Field label="City">
        <Input name="cityName" required />
      </Field>
      <Field label="Contact person">
        <Input name="contactPersonName" required />
      </Field>
      <Field label="Phone 1">
        <Input name="phone1" required />
      </Field>
      <Field label="Phone 2">
        <Input name="phone2" required />
      </Field>
      <Field label="Manager phone">
        <Input name="phone3" />
      </Field>
      <Field label="Manager name">
        <Input name="wareHouseManagerName" />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" loading={pending}>
          <MapPinPlus /> Create pickup address
        </Button>
      </div>
    </form>
  );
}

function AdviceForm({
  pending,
  trackingNumber,
  setTrackingNumber,
  run,
}: {
  pending: boolean;
  trackingNumber: string;
  setTrackingNumber: (value: string) => void;
  run: <T>(
    title: string,
    task: () => Promise<{ success: true; data: T } | { success: false; message: string }>,
  ) => void;
}) {
  const [statusId, setStatusId] = useState<'1' | '2'>('2');
  const [remarks, setRemarks] = useState('');

  return (
    <>
      <Field label="Tracking number">
        <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
      </Field>
      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <Field label="Advice">
          <select
            value={statusId}
            onChange={(e) => setStatusId(e.target.value as '1' | '2')}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="2">Retry attempt</option>
            <option value="1">Return requested</option>
          </select>
        </Field>
        <Field label="Remarks">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            run('Advice saved', () =>
              submitPostExShipperAdvice({
                trackingNumber,
                statusId: Number(statusId) as 1 | 2,
                remarks,
              }),
            )
          }
        >
          <Send /> Save advice
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() => run('Advice history', () => lookupPostExAdvice({ trackingNumber }))}
        >
          <Search /> Get advice
        </Button>
      </div>
    </>
  );
}

function ResultView({ value }: { value: Result }) {
  if (value == null) {
    return <p className="text-sm text-muted-foreground">Run a tool to see the response here.</p>;
  }
  return (
    <pre className="max-h-[620px] overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
