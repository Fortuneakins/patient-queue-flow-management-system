import { useEffect } from 'react';
import StaffManagementView from './StaffManagementView';
import SchedulingView from './SchedulingView';
import OverviewView from './OverviewView';
import DischargeLogView from './DischargeLogView';
import StaffDirectoryView from '../shared/StaffDirectoryView';
import PatientHistoryView from '../shared/PatientHistoryView';

export default function AdminWorkspace({ staff, shifts, overview, history, dischargeLog, performance, currentUser, activeTab='overview', onRefreshStaff, onRefreshShifts, onRefreshOverview, onRefreshPerformance, onRefreshHistory, onCreateStaff, onUpdateStatus, onUpdatePermission, onLoginHistory, onCreateShift, onDeleteShift }) {
  useEffect(()=>{if(activeTab==='overview'){onRefreshOverview();onRefreshPerformance()} if(activeTab==='staff'||activeTab==='directory'||activeTab==='shifts')onRefreshStaff(); if(activeTab==='shifts')onRefreshShifts(); if(activeTab==='log')onRefreshOverview();},[activeTab,onRefreshOverview,onRefreshPerformance,onRefreshShifts,onRefreshStaff]);
  return <div className="space-y-6"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700">Administrator workspace</p><h1 className="mt-1 font-display text-2xl font-bold">System administration</h1><p className="mt-1 text-sm text-stone-500">Manage accounts, shifts, queue oversight and discharge activity.</p></div>{activeTab==='overview'&&<OverviewView overview={overview} performance={performance}/>} {activeTab==='log'&&<DischargeLogView rows={dischargeLog}/>} {activeTab==='history'&&<PatientHistoryView history={history} onRefreshHistory={onRefreshHistory}/>} {activeTab==='staff'&&<StaffManagementView staff={staff} currentUser={currentUser} onCreateStaff={onCreateStaff} onUpdateStatus={onUpdateStatus} onUpdatePermission={onUpdatePermission} onLoginHistory={onLoginHistory}/>} {activeTab==='shifts'&&<SchedulingView staff={staff} shifts={shifts} onCreateShift={onCreateShift} onDeleteShift={onDeleteShift}/>} {activeTab==='directory'&&<StaffDirectoryView staff={staff}/>}</div>;
}
