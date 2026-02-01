"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Calculator, Target, Info, ChevronDown, ChevronUp, PieChart, Plus, Trash2, TrendingUp, Download, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// --- Types ---

interface Asset {
    id: string;
    name: string;
    currentValue: number;
    monthlyContribution: number;
    expectedRoi: number; // Annual %
    stepUpPercent: number; // Annual contribution increase %
}

interface Expense {
    id: string;
    name: string;
    amount: number; // Monthly
    inflates: boolean; // Does this expense grow with inflation?
    endsAtAge: number | null; // Does this expense stop? (e.g. Loans)
}

interface FinancialResult {
    yearsToTarget: number;
    totalMonthlyExpenseCurrent: number;
    futureMonthlyExpense: number;
    totalCorpus: number;
    monthlyPassiveIncome: number;
    gap: number;
    corpusNeeded: number;
    breakdown: {
        assetName: string;
        futureValue: number;
    }[];
    projection: {
        year: number;
        age: number;
        accumulated: number;
        required: number;
        monthlyExpense: number;
    }[];
}

export default function FutureIncomeCalculator() {
  // Global Params
  const [age, setAge] = useState<number>(30);
  const [targetAge, setTargetAge] = useState<number>(60);
  const [inflation, setInflation] = useState<number>(3); // %
  const [withdrawalRate, setWithdrawalRate] = useState<number>(4); // SWR %
  const [baseCurrency, setBaseCurrency] = useState<"INR" | "USD">("USD");
  const [exchangeRate, setExchangeRate] = useState<number>(84);

  // --- Detailed Asset State ---
  const [assets, setAssets] = useState<Asset[]>([
      { id: 'stocks', name: 'Stocks (ETFs/Mutual Funds)', currentValue: 50000, monthlyContribution: 1500, expectedRoi: 10, stepUpPercent: 5 },
      { id: 'espp', name: 'ESPP (Company Stock)', currentValue: 10000, monthlyContribution: 500, expectedRoi: 12, stepUpPercent: 3 },
      { id: 'retirement', name: 'Retirement (401k/EPF)', currentValue: 100000, monthlyContribution: 1000, expectedRoi: 8, stepUpPercent: 3 },
      { id: 'bonds', name: 'Bonds / Fixed Income', currentValue: 20000, monthlyContribution: 500, expectedRoi: 5, stepUpPercent: 0 },
      { id: 'hsa_inv', name: 'HSA Investments', currentValue: 5000, monthlyContribution: 200, expectedRoi: 7, stepUpPercent: 3 },
      { id: 'savings', name: 'Savings / Emergency Fund', currentValue: 10000, monthlyContribution: 500, expectedRoi: 3, stepUpPercent: 0 },
      { id: 'hsa_cash', name: 'HSA Cash', currentValue: 1000, monthlyContribution: 0, expectedRoi: 1, stepUpPercent: 0 },
      { id: 'rental', name: 'Income Generating Assets (Real Estate, Yields)', currentValue: 0, monthlyContribution: 0, expectedRoi: 5, stepUpPercent: 0 },
  ]);

  // --- Detailed Expense State ---
  const [expenses, setExpenses] = useState<Expense[]>([
      { id: 'housing', name: 'Rent & Utilities', amount: 2500, inflates: true, endsAtAge: null },
      { id: 'home_loan', name: 'Home Loan / Mortgage', amount: 1500, inflates: false, endsAtAge: 55 },
      { id: 'auto_loan', name: 'Auto Loan', amount: 500, inflates: false, endsAtAge: 40 },
      { id: 'edu_loan', name: 'Student Loan', amount: 300, inflates: false, endsAtAge: 38 },
      { id: 'living', name: 'Living (Groceries, Gas, Fun)', amount: 1500, inflates: true, endsAtAge: null },
      { id: 'health', name: 'Healthcare / Insurance', amount: 500, inflates: true, endsAtAge: null },
      { id: 'vacation', name: 'Vacation / Travel', amount: 300, inflates: true, endsAtAge: null },
      { id: 'overseas_transfer', name: 'Transfer to Overseas', amount: 500, inflates: true, endsAtAge: null },
      { id: 'subscriptions', name: 'Subscriptions & Misc', amount: 200, inflates: true, endsAtAge: null },
  ]);

  const [results, setResults] = useState<FinancialResult | null>(null);
  const [activeTab, setActiveTab] = useState<'inputs' | 'breakdown'>('inputs');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // --- Calculation Logic ---
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if(isMounted) calculate();
  }, [age, targetAge, assets, expenses, inflation, withdrawalRate, isMounted]);

  const calculate = () => {
    const years = Math.max(0, targetAge - age);

    // 1. Total Current Monthly Expenses
    const currentTotalExpense = expenses.reduce((acc, curr) => acc + curr.amount, 0);

    const projection = [];
    let finalTotalCorpus = 0;
    let finalBreakdown: { assetName: string; futureValue: number }[] = [];
    let finalFvExpense = 0;

    // Loop through each year to build projection
    for (let t = 0; t <= years; t++) {
        const currentYear = new Date().getFullYear() + t;
        const currentAge = age + t;
        
        // Expenses at year t
        // Logic: For each expense, check if active. If active, check if inflates.
        let expenseAtT = 0;
        expenses.forEach(exp => {
            if (exp.endsAtAge && currentAge > exp.endsAtAge) return;
            
            if (exp.inflates) {
                expenseAtT += exp.amount * Math.pow(1 + inflation / 100, t);
            } else {
                expenseAtT += exp.amount;
            }
        });

        const corpusNeededAtT = (expenseAtT * 12) / (withdrawalRate / 100);

        // Assets at year t
        let totalAssetsAtT = 0;
        const currentBreakdown: { assetName: string; futureValue: number }[] = [];

        assets.forEach(asset => {
            // Lump Sum FV: P * (1+r)^t
            const r = asset.expectedRoi;
            const fvLump = asset.currentValue * Math.pow(1 + r / 100, t);

             // Step-Up SIP
             // Formula for Step-Up SIP Future Value is complex.
             // We will iterate monthly to be precise or use yearly for approximation.
             // Given the loop is yearly (t), let's calculate the accumulation up to year t.
             // Actually, doing a nested loop 0..t is inefficient inside a loop 0..years.
             // Better: Calculate exact FV for this asset at this year 't'.
             
             // Simplification: Assume monthly contribution increases ONCE a year by stepUpPercent
             let fvSIP = 0;
             let accumulatedSIP = 0;
             let currentMonthly = asset.monthlyContribution;
             const monthlyRate = r / 1200; // r is annual %
             
             // We need to simulate the SIP accumulation year by year up to 't'
             // It's cleaner to just calculate it inside this 't' loop? No, that mixes logic.
             // Let's re-run a small loop from 0 to t for the SIP part to handle step-up correctly.
             
             let runningBalance = 0; // Just for the SIP part, lump sum is separate
             let monthlyContribution = asset.monthlyContribution;

             for(let i=0; i<t; i++) {
                // For this year 'i', we contribute 'monthlyContribution' for 12 months earning 'monthlyRate'
                // FV of annuity for this year: P * [ (1+r)^12 - 1 ] / r
                // But wait, the balance from previous years also grows.
                
                // 1. Grow previous balance for 1 year
                runningBalance = runningBalance * (1 + r/100);
                
                // 2. Add this year's contributions (fv of 12 payments at end of year)
                // If r=10%, monthly=100.
                let yearContributionFV = 0;
                if (monthlyRate > 0) {
                     yearContributionFV = monthlyContribution * ((Math.pow(1 + monthlyRate, 12) - 1) / monthlyRate) * (1 + monthlyRate); // Annuity Due (start of month)
                } else {
                     yearContributionFV = monthlyContribution * 12;
                }
                
                runningBalance += yearContributionFV;
                
                // 3. Step up contribution for next year
                monthlyContribution = monthlyContribution * (1 + asset.stepUpPercent/100);
             }
             
             fvSIP = runningBalance;
             
             const assetTotal = fvLump + fvSIP;
             totalAssetsAtT += assetTotal;
             
             if (t === years) {
                 currentBreakdown.push({ assetName: asset.name, futureValue: assetTotal });
             }
        });

        projection.push({ 
            year: currentYear, 
            age: currentAge, 
            accumulated: totalAssetsAtT, 
            required: corpusNeededAtT,
            monthlyExpense: expenseAtT
        });

        if (t === years) {
            finalTotalCorpus = totalAssetsAtT;
            finalBreakdown = currentBreakdown;
            finalFvExpense = expenseAtT;
        }
    }

    // 4. Safe Withdrawal
    const monthlyPassiveIncome = (finalTotalCorpus * (withdrawalRate/100)) / 12;
    const gap = monthlyPassiveIncome - finalFvExpense;
    const corpusNeeded = (finalFvExpense * 12) / (withdrawalRate/100);

    setResults({
        yearsToTarget: years,
        totalMonthlyExpenseCurrent: currentTotalExpense,
        futureMonthlyExpense: finalFvExpense,
        totalCorpus: finalTotalCorpus,
        monthlyPassiveIncome,
        gap,
        corpusNeeded,
        breakdown: finalBreakdown.sort((a,b) => b.futureValue - a.futureValue),
        projection
    });
  };

  // --- Handlers ---
  const updateAsset = (index: number, field: keyof Asset, value: any) => {
      const newAssets = [...assets];
      newAssets[index] = { ...newAssets[index], [field]: value };
      setAssets(newAssets);
  };
  
  const updateExpense = (index: number, field: keyof Expense, value: any) => {
      const newExpenses = [...expenses];
      newExpenses[index] = { ...newExpenses[index], [field]: value };
      setExpenses(newExpenses);
  };

  const formatCurrency = (amount: number) => {
      if (!isFinite(amount)) return "-";
      return new Intl.NumberFormat(baseCurrency === 'INR' ? 'en-IN' : 'en-US', {
          style: 'currency',
          currency: baseCurrency,
          maximumFractionDigits: 0
      }).format(amount);
  };

  // Helper: Display component
  const StatCard = ({ label, value, subtext, highlight = false, isNegative = false }: any) => (
      <div className={`p-4 rounded-xl border ${highlight ? (isNegative ? 'bg-red-50 border-red-100 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900') : 'bg-white border-slate-200'}`}>
          <div className="text-xs font-semibold uppercase opacity-60 mb-1">{label}</div>
          <div className="text-2xl font-bold">{formatCurrency(value)}</div>
          {subtext && <div className="text-xs mt-1 opacity-80">{subtext}</div>}
      </div>
  );

  const generateReportDoc = () => {
    if (!results) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // --- Header ---
    doc.setFillColor(16, 185, 129); // Emerald 500
    doc.rect(0, 0, pageWidth, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("DATABRO FINANCIAL PLANNER", 14, 13);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString(), pageWidth - 14, 13, { align: "right" });

    // --- Title & Summary ---
    doc.setTextColor(30, 41, 59); // Slate 800
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Projected Financial Freedom Report", 14, 35);
    
    // Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 42, pageWidth - 28, 35, 3, 3, "FD");

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Target Corpus Needed", 14, 52);
    doc.text("Projected Corpus", 65, 52);
    doc.text("Monthly Passive Inc.", 115, 52);
    doc.text("Gap / Surplus", 196, 52, { align: "right" });

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(results.corpusNeeded), 14, 60);
    doc.text(formatCurrency(results.totalCorpus), 65, 60);
    doc.text(formatCurrency(results.monthlyPassiveIncome), 115, 60);
    
    const gapColor = results.gap >= 0 ? [16, 185, 129] : [239, 68, 68];
    doc.setTextColor(gapColor[0], gapColor[1], gapColor[2]);
    doc.text(formatCurrency(results.gap), 196, 60, { align: "right" });

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text(`Params: Current Age ${age} | Target Age ${targetAge} | Inflation ${inflation}% | Base Currency ${baseCurrency}`, 20, 70);

    let yPos = 80;

    // --- User Inputs (Expenses & Assets) ---
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("User Inputs Overview", 14, yPos);
    yPos += 5;

    // Expenses Table
    autoTable(doc, {
        startY: yPos,
        head: [['Expense Category', 'Monthly Amount', 'Inflates?', 'Ends at Age']],
        body: expenses.map(e => [
            e.name,
            formatCurrency(e.amount),
            e.inflates ? "Yes" : "No",
            e.endsAtAge ? e.endsAtAge : "Life-long"
        ]),
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fontStyle: 'bold', textColor: 100 },
        columnStyles: { 
            0: { cellWidth: 80 },
            1: { halign: 'right' },
            2: { halign: 'center' },
            3: { halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });
    // @ts-expect-error autoTable finalY
    yPos = doc.lastAutoTable.finalY + 10;

    // Assets Table
    autoTable(doc, {
        startY: yPos,
        head: [['Asset Class', 'Current Value', 'Monthly (+)', 'ROI %', 'Step Up %']],
        body: assets.map(a => [
            a.name,
            formatCurrency(a.currentValue),
            formatCurrency(a.monthlyContribution),
            a.expectedRoi + "%",
            a.stepUpPercent + "%"
        ]),
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fontStyle: 'bold', textColor: 100 },
        columnStyles: { 
            0: { cellWidth: 80 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'center' },
            4: { halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });
    // @ts-expect-error autoTable finalY
    yPos = doc.lastAutoTable.finalY + 15;


    // --- Methodology ---
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Methodology & Assumptions", 14, yPos);
    
    yPos += 8;

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    const assumptions = [
        `1. Inflation Projection: Expenses (that are marked 'Inflates') are projected to grow at a compound annual rate of ${inflation}%. Fixed expenses (like loans) remain constant until their end date.`,
        `2. Investment Growth Strategy: Future values are calculated based on the specific Expected ROI for each asset class.`,
        `3. Dynamic Contributions (Step-Up): The model assumes your monthly contributions increase annually by the 'Step Up %' defined for each asset, simulating salary growth.`,
        `4. Withdrawal Methodology: The 'Corpus Needed' is derived using a ${withdrawalRate}% Safe Withdrawal Rate (SWR). Formula: (Annual Expense at Target Age) / (${withdrawalRate} / 100). This determines the capital required to generating sufficient passive income.`,
        `5. Projections are mathematical estimates based on constant rates of return and do not account for market volatility or tax implications.`,
        `6. Trademark: Databro™ is a registered trademark of Databro Inc. Report generated on ${new Date().toLocaleDateString()}.`
    ];
    
    const maxLineWidth = pageWidth - 28;
    const lineHeight = 5;

    assumptions.forEach(line => {
        const splitText = doc.splitTextToSize(line, maxLineWidth);
        
        // Check for page break
        if(yPos + (splitText.length * lineHeight) > doc.internal.pageSize.height - 20) {
            doc.addPage();
            yPos = 20;
        }

        doc.text(splitText, 14, yPos);
        yPos += splitText.length * lineHeight + 2; // Adjust vertical spacing based on lines
    });

    // --- Table ---
    autoTable(doc, {
        startY: yPos + 10,
        head: [['Year', 'Age', 'M. Expense', 'Projected Corpus', 'Required Corpus', 'Status']],
        body: results.projection.map(row => [
            row.year,
            row.age,
            formatCurrency(row.monthlyExpense),
            formatCurrency(row.accumulated),
            formatCurrency(row.required),
            row.accumulated >= row.required ? "Freedom Achieved" : "Building Wealth"
        ]),
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle', halign: 'right' },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            1: { halign: 'center', cellWidth: 15 },
            2: { halign: 'right', cellWidth: 25 },
            3: { halign: 'right', cellWidth: 35 },
            4: { halign: 'right', cellWidth: 35 },
            5: { halign: 'center', fontStyle: 'italic' }
        },
        didDrawPage: (data: any) => {
             // Footer
             doc.setFontSize(8);
             doc.setTextColor(150);
             const pageSize = doc.internal.pageSize;
             const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
             doc.text("Databro™ Financial Tools - Confidential & Private", data.settings.margin.left, pageHeight - 10);
             
             // Check if pageNumber is available in footer context, otherwise standard paging
             // autoTable handles paging internally usually, but manually adding works if explicit
             // doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - data.settings.margin.right, pageHeight - 10, { align: "right" });
        }
    });

    return doc;
  };

  const downloadReport = () => {
    if (!results) return;
    const doc = generateReportDoc();
    if (doc) doc.save(`Databro_Financial_Plan_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const shareReport = async () => {
    if (!results) return;
    const doc = generateReportDoc();
    if (!doc) return;

    try {
        const filename = `Databro_Financial_Plan_${new Date().toISOString().split('T')[0]}.pdf`;
        const blob = doc.output('blob');
        const file = new File([blob], filename, { type: "application/pdf" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Financial Freedom Plan',
                text: 'Check out my financial freedom projection!',
            });
        } else {
            alert("Sharing is not supported on this device. Downloading instead.");
            doc.save(filename);
        }
    } catch (err) {
        console.error("Share failed", err);
    }
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
           <div className="flex items-center gap-4">
                <Link href="/tools" className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-emerald-600" />
                    Detailed Financial Planner
                    </h1>
                    <p className="text-slate-500 text-sm">Asset-class ROI breakdown & Expense categorization</p>
                </div>
           </div>
           
           <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                   <button 
                      onClick={shareReport}
                      disabled={!results}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-slate-50 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                       <Share2 className="w-4 h-4" />
                       <span className="hidden sm:inline">Share</span>
                   </button>
                   <button 
                      onClick={downloadReport}
                      disabled={!results}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl shadow-sm hover:bg-indigo-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                       <Download className="w-4 h-4" />
                       <span className="hidden sm:inline">Download</span>
                   </button>
               </div>
               <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                    <div className="text-sm font-medium text-slate-600 pl-2">Currency:</div>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        <button onClick={() => setBaseCurrency("INR")} className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${baseCurrency === "INR" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>INR</button>
                        <button onClick={() => setBaseCurrency("USD")} className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${baseCurrency === "USD" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>USD</button>
                    </div>
                    {baseCurrency === "USD" && (
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-3 pr-2">
                            <span className="text-xs text-slate-400">Rate:</span>
                            <input 
                                type="number" 
                                className="w-12 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-sm text-center" 
                                value={exchangeRate}
                                onChange={(e) => setExchangeRate(Number(e.target.value))}
                            />
                        </div>
                    )}
               </div>
           </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: INPUTS */}
            <div className="xl:col-span-1 space-y-6 xl:max-h-[calc(100vh-120px)] xl:overflow-y-auto xl:pr-2 custom-scrollbar">
                
                {/* 1. Global Parameters */}
                <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Target className="w-4 h-4 text-emerald-500" />
                        Goals & Timeline
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="text-xs font-semibold text-slate-500 uppercase">Current Age</label>
                             <input type="number" value={age} onChange={e => setAge(Number(e.target.value))} className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-slate-900" />
                         </div>
                         <div>
                             <label className="text-xs font-semibold text-slate-500 uppercase">Retire Age</label>
                             <input type="number" value={targetAge} onChange={e => setTargetAge(Number(e.target.value))} className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-slate-900" />
                         </div>
                    </div>
                    <div>
                         <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Inflation Projection</label>
                            <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{inflation}%</span>
                         </div>
                         <input type="range" min="0" max="15" step="0.5" value={inflation} onChange={e => setInflation(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                    </div>
                    <div>
                         <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Withdrawal Rate (SWR)</label>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${withdrawalRate > 4 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{withdrawalRate}%</span>
                         </div>
                         <input type="range" min="2" max="6" step="0.1" value={withdrawalRate} onChange={e => setWithdrawalRate(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                         <div className="text-[10px] text-slate-400 mt-1">
                            {withdrawalRate > 4 ? "Aggressive (Standard is 4%)" : "Conservative (Safer for <60 retirement)"}
                         </div>
                    </div>
                </section>

                {/* 2. Detailed Expenses */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-red-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 text-sm">Monthly Expenses</h3>
                        <span className="text-xs font-mono font-bold text-red-600">{formatCurrency(results?.totalMonthlyExpenseCurrent || 0)}</span>
                    </div>
                    <div className="p-2 space-y-4">
                        {[
                            { title: 'Debts & Loans', filter: (e: Expense) => e.id.includes('loan') },
                            { title: 'Living & Lifestyle', filter: (e: Expense) => !e.id.includes('loan') }
                        ].map((group) => (
                            <div key={group.title}>
                                <div className="px-2 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group.title}</div>
                                <div className="space-y-1">
                                    {expenses.map((exp, idx) => ({ ...exp, idx }))
                                        .filter(exp => group.filter(expenses[exp.idx]))
                                        .map((exp) => (
                                        <div key={exp.id} className="flex gap-2 items-center p-2 hover:bg-slate-50 rounded-lg group text-sm">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="text" 
                                                        value={exp.name} 
                                                        onChange={(e) => updateExpense(exp.idx, 'name', e.target.value)}
                                                        className="w-full bg-transparent font-medium text-slate-700 outline-none placeholder:text-slate-300"
                                                        placeholder="Category name"
                                                    />
                                                    <button 
                                                        onClick={() => updateExpense(exp.idx, 'inflates', !exp.inflates)}
                                                        className={`mx-1 p-1 rounded text-[10px] uppercase font-bold tracking-wider ${exp.inflates ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}
                                                        title="Does this expense inflate?"
                                                    >
                                                        {exp.inflates ? 'Inflates' : 'Fixed'}
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-slate-400">Ends at Age:</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="Never"
                                                        value={exp.endsAtAge || ''}
                                                        onChange={(e) => updateExpense(exp.idx, 'endsAtAge', e.target.value ? Number(e.target.value) : null)}
                                                        className="w-12 bg-transparent border-b border-slate-200 text-xs text-slate-600 focus:border-red-300 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="w-24">
                                                <input 
                                                    type="number" 
                                                    value={exp.amount} 
                                                    onChange={(e) => updateExpense(exp.idx, 'amount', Number(e.target.value))}
                                                    className="w-full text-right bg-slate-50 border border-slate-100 rounded px-2 py-1 font-mono focus:border-red-300 outline-none"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                 {/* 3. Detailed Assets */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-emerald-50/30">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center justify-between">
                            <span>Investment Portfolio</span>
                            <div className="flex gap-2 text-[10px] font-normal text-slate-400 uppercase tracking-widest">
                                <span>ROI</span>
                                <span>Step</span>
                            </div>
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {[
                            { title: 'Growth Assets (Equity & Real Estate)', filter: (a: Asset) => ['stocks', 'espp', 'retirement', 'hsa_inv', 'rental'].includes(a.id) },
                            { title: 'Fixed Income & Cash', filter: (a: Asset) => ['bonds', 'savings', 'hsa_cash'].includes(a.id) }
                        ].map((group) => (
                            <div key={group.title}>
                                <div className="px-3 py-2 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-y border-slate-100">{group.title}</div>
                                <div>
                                    {assets.map((asset, idx) => ({ ...asset, idx }))
                                        .filter(asset => group.filter(assets[asset.idx]))
                                        .map((asset) => (
                                        <div key={asset.id} className="p-3 hover:bg-slate-50 transition-colors">
                                            <div className="flex justify-between items-center mb-2">
                                                <input 
                                                    value={asset.name} 
                                                    onChange={e => updateAsset(asset.idx, 'name', e.target.value)}
                                                    className="font-semibold text-sm text-slate-700 bg-transparent outline-none w-full"
                                                />
                                                <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100" title="Expected Annual ROI">
                                                    <input 
                                                        type="number" 
                                                        value={asset.expectedRoi} 
                                                        onChange={e => updateAsset(asset.idx, 'expectedRoi', Number(e.target.value))}
                                                        className="w-8 text-right bg-transparent text-xs font-bold text-emerald-700 outline-none"
                                                    />
                                                    <span className="text-[10px] text-emerald-600">%</span>
                                                </div>
                                                {/* Step Up */}
                                                <div className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100" title="Annual Contribution Step Up %">
                                                    <div className="text-[10px] text-blue-600 font-bold">↑</div>
                                                    <input 
                                                        type="number" 
                                                        value={asset.stepUpPercent} 
                                                        onChange={e => updateAsset(asset.idx, 'stepUpPercent', Number(e.target.value))}
                                                        className="w-8 text-right bg-transparent text-xs font-bold text-blue-700 outline-none"
                                                    />
                                                    <span className="text-[10px] text-blue-600">%</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] uppercase text-slate-400 font-bold">Corpus</label>
                                                    <input 
                                                        type="number" 
                                                        value={asset.currentValue}
                                                        onChange={e => updateAsset(asset.idx, 'currentValue', Number(e.target.value))}
                                                        className="w-full text-sm font-mono bg-white border border-slate-200 rounded px-2 py-1 focus:border-emerald-500 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase text-slate-400 font-bold">Monthly (+)</label>
                                                    <input 
                                                        type="number" 
                                                        value={asset.monthlyContribution}
                                                        onChange={e => updateAsset(asset.idx, 'monthlyContribution', Number(e.target.value))}
                                                        className="w-full text-sm font-mono bg-white border border-slate-200 rounded px-2 py-1 focus:border-emerald-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* RIGHT COLUMN: RESULTS */}
            <div className="xl:col-span-2 space-y-6">
                
                {/* 1. Hero Summary */}
                {results && (
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
                        
                        <div className="relative z-10">
                            <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
                                <div className="space-y-4 w-full md:w-auto">
                                     <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 text-xs font-medium text-emerald-300 w-fit">
                                         <Target className="w-3 h-3 flex-shrink-0" />
                                         <span className="truncate">Financial Freedom Target: Age {targetAge}</span>
                                     </div>
                                     <div>
                                         <h2 className="text-3xl font-bold mb-1">Total Corpus Needed</h2>
                                         <p className="text-slate-400 text-sm">To sustain lifestyle adjusted for inflation</p>
                                     </div>
                                     <div className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                                         {formatCurrency(results.corpusNeeded)}
                                     </div>
                                </div>
                                
                                <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/5 min-w-[240px]">
                                     <div className="text-xs text-slate-300 mb-1">Projected Monthly Spend</div>
                                     <div className="text-2xl font-bold text-white mb-4">{formatCurrency(results.futureMonthlyExpense)}</div>
                                     
                                     <div className="text-xs text-slate-300 mb-1">Current Monthly Spend</div>
                                     <div className="text-lg font-medium text-white/60 line-through decoration-white/30">{formatCurrency(results.totalMonthlyExpenseCurrent)}</div>
                                </div>
                            </div>

                            {/* Status Bar */}
                             <div className="mt-8 pt-8 border-t border-white/10">
                                 <div className="flex justify-between text-sm font-medium mb-3">
                                     <span className={results.gap >= 0 ? "text-emerald-400" : "text-orange-400"}>
                                         {results.gap >= 0 ? "Target Achieved!" : "Projected Shortfall"}
                                     </span>
                                     <span className="text-white/60">
                                         {formatCurrency(results.totalCorpus)} Projected Savings
                                     </span>
                                 </div>
                                 <div className="h-4 bg-black/40 rounded-full overflow-hidden backdrop-blur-md">
                                     <motion.div 
                                         className={`h-full ${results.gap >= 0 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-orange-500 to-red-500'}`}
                                         initial={{ width: 0 }}
                                         animate={{ width: `${Math.min((results.totalCorpus / results.corpusNeeded) * 100, 100)}%` }}
                                         transition={{ duration: 1.2, ease: "easeOut" }}
                                     />
                                 </div>
                                 <div className="mt-2 text-xs flex justify-between text-white/40 font-mono">
                                     <span>SWR: {withdrawalRate}%</span>
                                     <span>{Math.round((results.totalCorpus / results.corpusNeeded) * 100)}% Funded</span>
                                 </div>
                             </div>
                        </div>
                    </div>
                )}

                {/* 2. Key Metrics Grid */}
                {results && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard 
                            label="Monthly Passive Income" 
                            value={results.monthlyPassiveIncome} 
                            subtext={`@ ${withdrawalRate}% Withdrawal`}
                        />
                        <StatCard 
                            label={results.gap >= 0 ? "Monthly Surplus" : "Monthly Deficit"} 
                            value={Math.abs(results.gap)} 
                            highlight={true}
                            isNegative={results.gap < 0}
                            subtext="Inflation Adjusted"
                        />
                        <StatCard 
                            label="Total Investment Value" 
                            value={results.totalCorpus} 
                            subtext={`Avg ROI weighted`}
                        />
                        <StatCard 
                            label="Inflation Multiplier" 
                            value={results.futureMonthlyExpense / results.totalMonthlyExpenseCurrent} // Cheap hack to show float
                            subtext={`Value erosion over ${results.yearsToTarget}y`}
                        />
                    </div>
                )}

                {/* 2b. Growth Projection Chart */}
                {results && results.projection && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                             <TrendingUp className="w-5 h-5 text-indigo-500" />
                             Wealth Accumulation Path
                        </h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={results.projection} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis 
                                        dataKey="age" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748B', fontSize: 12 }} 
                                        dy={10}
                                        label={{ value: 'Age', position: 'insideBottom', offset: -5, fill: '#94A3B8', fontSize: 10 }}
                                    />
                                    <YAxis 
                                        yAxisId="left"
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748B', fontSize: 12 }} 
                                        tickFormatter={(val) => `${(val/1000000).toFixed(1)}M`}
                                    />
                                    <YAxis 
                                        yAxisId="right"
                                        orientation="right"
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#F43F5E', fontSize: 10 }} 
                                        tickFormatter={(val) => `${(val/1000).toFixed(0)}k`}
                                        domain={[0, (dataMax: number) => dataMax * 5]} 
                                    />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(val: any) => formatCurrency(val)}
                                        labelFormatter={(label) => `Age ${label}`}
                                    />
                                    <Legend />
                                    <Line 
                                        yAxisId="left"
                                        type="monotone" 
                                        dataKey="accumulated" 
                                        name="Portfolio Value" 
                                        stroke="#6366f1" 
                                        strokeWidth={3} 
                                        dot={false}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                    <Line 
                                        yAxisId="left"
                                        type="monotone" 
                                        dataKey="required" 
                                        name="Target Corpus (Invested Weath Needed)" 
                                        stroke="#10b981" 
                                        strokeWidth={2} 
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                    <Line 
                                        yAxisId="right"
                                        type="monotone" 
                                        dataKey="monthlyExpense" 
                                        name="Projected Monthly Spend" 
                                        stroke="#F43F5E" 
                                        strokeWidth={2} 
                                        dot={false}
                                        strokeDasharray="2 2"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* 3. Detailed Breakdown Charts */}
                {results && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Asset Contribution List */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <PieChart className="w-4 h-4 text-slate-500" />
                                Future Portfolio Value
                            </h3>
                            <div className="space-y-4">
                                {results.breakdown.map((item, idx) => (
                                    <div key={item.assetName} className="group">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-slate-700">{item.assetName}</span>
                                            <span className="font-mono text-slate-600">{formatCurrency(item.futureValue)}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <motion.div 
                                                className="h-full bg-indigo-500"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(item.futureValue / results.totalCorpus) * 100}%` }}
                                                transition={{ delay: idx * 0.1 }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recommendation / Insight */}
                        <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-6 flex flex-col justify-center">
                            <h3 className="font-bold text-slate-800 mb-2">Analysis</h3>
                            <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                Based on a {inflation}% inflation rate, your current monthly expenses of <strong>{formatCurrency(results.totalMonthlyExpenseCurrent)}</strong> will balloon to <strong>{formatCurrency(results.futureMonthlyExpense)}</strong> by age {targetAge}.
                            </p>
                            {results.gap < 0 ? (
                                <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm border border-red-100">
                                    <strong>Gap Alert:</strong> You are short by {formatCurrency(Math.abs(results.gap))} monthly. Consider increasing your generic stocks contribution or extending your retirement age by 2-3 years.
                                </div>
                            ) : (
                                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm border border-emerald-100">
                                    <strong>On Track:</strong> Your diversified portfolio is projected to generate {formatCurrency(results.gap)} surplus monthly. You could retire {Math.floor(results.gap / results.futureMonthlyExpense * 5)} years early!
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
}
