import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExpandedReinforcementData, FoundationPriorityWorkingRow, FrameData } from '../../types';
import { ReportTab } from './ReportTab';

const TEMPLATE_PATH = resolve(__dirname, '../../samples/V2.4 TnfDesignInformation_v08_Template.xlsm');

/** Hand the component the real template through its file input. */
async function uploadTemplate(user: ReturnType<typeof userEvent.setup>) {
  const file = new File([readFileSync(TEMPLATE_PATH)], 'Template.xlsm', {
    type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  });
  await user.upload(screen.getByLabelText('Upload template file'), file);
}

const columnData: ExpandedReinforcementData[] = [
  {
    foundation: 'F1',
    columnType: 'FC1',
    bColumn: '800',
    hColumn: '800',
    dimensionWidth: '500',
    dimensionHeight: '500',
    mainReinforcementCount: '12',
    mainReinforcementSize: '22',
    hoopReinforcementSize: '10',
    hoopReinforcementSpacing: '100',
  },
];

const priorityData: FoundationPriorityWorkingRow[] = [
  {
    rowId: 'p:F1',
    sourceKey: 'priority:F1',
    sourceFileIds: ['plan'],
    provenance: 'extracted',
    edited: false,
    foundation: 'F1',
    codes: ['FC1'],
    resolutions: [
      {
        columnType: 'FC1',
        method: 'plan-fc',
        locations: [
          { evidenceId: 'a', plan: { fileId: 'plan', role: 'plan', xAxis: 'X1', yAxis: 'Y1' } },
          { evidenceId: 'b', plan: { fileId: 'plan', role: 'plan', xAxis: 'X2', yAxis: 'Y1' } },
        ],
      },
    ],
  },
];

const frameData: FrameData[] = [
  {
    frameType: 'FW',
    frameName: 'FW1',
    b: '150',
    h: '600',
    fwBaseRebarDiameter: '13',
    fwVerticalRebarDiameter: '13',
    fwHorizontalRebarCount: '4',
    fwHorizontalRebarDiameter: '10',
  },
];

const renderAll = () =>
  render(<ReportTab data={columnData} frameData={frameData} priorityData={priorityData} />);

describe('ReportTab upload flow', () => {
  // Vitest runs without globals, so RTL's auto-cleanup never fires on its own.
  afterEach(cleanup);

  it('blocks only when every tab is empty', () => {
    render(<ReportTab data={[]} frameData={[]} priorityData={[]} />);
    expect(screen.getByText('No Data Available')).toBeInTheDocument();
  });

  it('offers the upload flow when any single tab has results', () => {
    render(<ReportTab data={[]} frameData={frameData} priorityData={[]} />);
    expect(screen.getByText(/Drop your Excel report template here/i)).toBeInTheDocument();
  });

  it('detects all three template sheets and reports them as fillable', async () => {
    const user = userEvent.setup();
    renderAll();
    await uploadTemplate(user);

    expect(await screen.findByRole('checkbox', { name: 'Fill Foundation Type' }, { timeout: 5000 })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fill Foundation Instance' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fill Framing Type' })).toBeChecked();
    expect(screen.getByText(/3 of 3 detected sheets will be filled/i)).toBeInTheDocument();
  });

  it('previews the foundation column that used to come out empty', async () => {
    const user = userEvent.setup();
    renderAll();
    await uploadTemplate(user);
    await screen.findByRole('checkbox', { name: 'Fill Foundation Type' }, { timeout: 5000 });

    const lxRow = screen.getByRole('row', { name: /柱型_Lx/ });
    expect(within(lxRow).getByText('500')).toBeInTheDocument();

    const phasingRows = screen.getAllByRole('row', { name: /Phasing/ });
    expect(within(phasingRows[0]).getAllByText('施工').length).toBeGreaterThan(0);
  });

  it('previews one instance column per grid intersection', async () => {
    const user = userEvent.setup();
    renderAll();
    await uploadTemplate(user);
    await screen.findByRole('checkbox', { name: 'Fill Foundation Instance' }, { timeout: 5000 });

    // Two intersections for the one foundation → two columns, not one.
    expect(screen.getByRole('columnheader', { name: 'F1@X1-Y1' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'F1@X2-Y1' })).toBeInTheDocument();

    const xAxisRow = screen.getByRole('row', { name: /X軸/ });
    expect(within(xAxisRow).getByText('X1')).toBeInTheDocument();
    expect(within(xAxisRow).getByText('X2')).toBeInTheDocument();
  });

  it('lets a sheet be skipped without touching the others', async () => {
    const user = userEvent.setup();
    renderAll();
    await uploadTemplate(user);
    const toggle = await screen.findByRole(
      'checkbox',
      { name: 'Fill Framing Type' },
      { timeout: 5000 },
    );

    expect(screen.getByRole('columnheader', { name: 'FW1' })).toBeInTheDocument();
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: 'FW1' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/2 of 3 detected sheets will be filled/i)).toBeInTheDocument();
    // The other sheets keep their previews.
    expect(screen.getByRole('columnheader', { name: 'F1@X1-Y1' })).toBeInTheDocument();
  });

  it('shows a sheet as having no data rather than hiding it', async () => {
    const user = userEvent.setup();
    render(<ReportTab data={columnData} frameData={[]} priorityData={[]} />);
    await uploadTemplate(user);

    const frameToggle = await screen.findByRole(
      'checkbox',
      { name: 'Fill Framing Type' },
      { timeout: 5000 },
    );
    expect(frameToggle).toBeDisabled();
    expect(screen.getAllByText(/no data yet/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 of 3 detected sheets will be filled/i)).toBeInTheDocument();
  });
});
